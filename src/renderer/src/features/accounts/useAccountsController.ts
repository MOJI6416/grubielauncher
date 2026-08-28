import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { IAuthResponse } from "@/types/Auth";
import type { AccountType, ILocalAccount } from "@/types/Account";
import {
  DISCORD_CLIENT_ID,
  ELYBY_CLIENT_ID,
  MICROSOFT_CLIENT_ID,
} from "@/shared/config";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  selectedVersionAtom,
} from "@renderer/stores/atoms";
import {
  createCodeChallenge,
  createCodeVerifier,
} from "@renderer/utilities/pkce";
import { showFailureToast } from "@renderer/utilities/failures";
import { accountIdentity, accountSubject, accountUuid } from "./identity";
import {
  authFailureSide,
  describeAuthFailure,
  type AuthFailureReason,
} from "./authErrors";
import { nextSelectionAfterRemoval } from "./list";
import { switchAccount } from "./switchAccount";
import type { OnlineProvider } from "./providers";

const api = window.api;

export const OAUTH_WINDOW_MS = 10 * 60 * 1000;

export interface AuthProgress {
  provider: OnlineProvider;
  stage: "waiting" | "exchanging" | "failed";
  authUrl: string;
  startedAt: number;
  reason: AuthFailureReason | null;
}

function buildAuthUrl(
  provider: OnlineProvider,
  state: string,
  codeChallenge?: string,
): string {
  const redirect = "http://localhost:53213/callback";

  if (provider === "microsoft") {
    return `https://login.live.com/oauth20_authorize.srf?client_id=${MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=${redirect}&scope=XboxLive.signin%20offline_access&prompt=select_account&state=${encodeURIComponent(state)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  }

  if (provider === "elyby") {
    return `https://account.ely.by/oauth2/v1?client_id=${ELYBY_CLIENT_ID}&redirect_uri=${redirect}&response_type=code&scope=offline_access%20account_info%20minecraft_server_session&state=${encodeURIComponent(state)}`;
  }

  return `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&scope=identify+guilds.join&state=${encodeURIComponent(state)}`;
}

export function useAccountsController() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const setVersion = useSetAtom(selectedVersionAtom);

  const [progress, setProgress] = useState<AuthProgress | null>(null);
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null);

  const sessionRef = useRef(0);
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  const persist = useCallback(
    async (
      next: ILocalAccount[],
      selected: ILocalAccount | null,
      failureTitle: string,
    ) => {
      const saved = await api.accounts.save(
        next,
        selected ? accountIdentity(selected) : null,
      );
      if (!saved) {
        showFailureToast(failureTitle, undefined, {
          channels: ["accounts:save"],
          fallbackDescription: t("accounts.saveFailedHint"),
        });
        return false;
      }

      setAccounts(next);
      return true;
    },
    [setAccounts, t],
  );

  const clearSkinManager = useCallback(
    async (account: ILocalAccount) => {
      try {
        const uuid =
          (selectedAccount && accountIdentity(selectedAccount) === accountIdentity(account)
            ? authData?.uuid
            : accountUuid(account)) || account.nickname;
        await api.skins.clearManager(uuid, account.type);
      } catch {}
    },
    [authData?.uuid, selectedAccount],
  );

  const cancelAuth = useCallback(() => {
    sessionRef.current++;
    setProgress(null);
    void api.auth.stopServer().catch(() => undefined);
  }, []);

  const upsertAccount = useCallback(
    async (provider: OnlineProvider, authUser: IAuthResponse) => {
      const current = accountsRef.current;
      const subject = accountSubject({ ...authUser, type: provider });

      const index = current.findIndex((entry) => {
        if (entry.type !== provider) return false;
        const entrySubject = accountSubject(entry);
        return subject
          ? entrySubject === subject
          : entry.nickname === authUser.nickname;
      });

      const account: ILocalAccount = {
        ...authUser,
        type: provider,
        image: authUser.image || "",
        friends: index >= 0 ? current[index].friends || [] : [],
      };

      const next =
        index >= 0
          ? current.map((entry, position) =>
              position === index ? account : entry,
            )
          : [...current, account];

      const saved = await persist(next, account, t("accounts.addFailed"));
      if (saved) setSelectedAccount(account);

      return { account, replaced: index >= 0, saved };
    },
    [persist, setSelectedAccount, t],
  );

  const signIn = useCallback(
    async (provider: OnlineProvider) => {
      const state = `${provider}:${crypto.randomUUID()}`;
      let codeVerifier: string | undefined;
      let codeChallenge: string | undefined;

      if (provider === "microsoft") {
        codeVerifier = createCodeVerifier();
        codeChallenge = await createCodeChallenge(codeVerifier);
      }

      const authUrl = buildAuthUrl(provider, state, codeChallenge);
      const sessionId = ++sessionRef.current;

      setProgress({
        provider,
        stage: "waiting",
        authUrl,
        startedAt: Date.now(),
        reason: null,
      });

      const waitForOAuth = api.auth.startServer(state);
      waitForOAuth.catch(() => undefined);

      try {
        await api.shell.openExternal(authUrl);
        const callback = await waitForOAuth;

        if (sessionRef.current !== sessionId) return;
        if (
          callback.provider !== "microsoft" &&
          callback.provider !== "discord" &&
          callback.provider !== "elyby"
        ) {
          return;
        }

        setProgress((prev) =>
          prev ? { ...prev, stage: "exchanging", reason: null } : prev,
        );

        let authUser: IAuthResponse | null = null;
        if (callback.provider === "microsoft") {
          authUser = await api.auth.microsoft(callback.code, codeVerifier);
        } else if (callback.provider === "elyby") {
          authUser = await api.auth.elyby(callback.code);
        } else {
          authUser = await api.auth.discord(callback.code);
        }

        if (sessionRef.current !== sessionId) return;
        if (!authUser) throw new Error("Empty auth response");

        const { replaced, saved } = await upsertAccount(
          callback.provider,
          authUser,
        );

        setProgress(null);
        if (!saved) return;
        toast.success(replaced ? t("accountInfo.updated") : t("accounts.added"));
      } catch (error) {
        if (sessionRef.current !== sessionId) return;

        const failure = describeAuthFailure(error, provider);
        if (failure.silent) {
          setProgress(null);
          return;
        }

        setProgress((prev) =>
          prev ? { ...prev, stage: "failed", reason: failure.reason } : prev,
        );
      }
    },
    [t, upsertAccount],
  );

  const addOfflineAccount = useCallback(
    async (nickname: string) => {
      const value = nickname.trim();
      if (!value) return false;

      const account: ILocalAccount = {
        nickname: value,
        type: "plain",
        image: "",
        friends: [],
      };

      const next = [...accountsRef.current, account];
      if (!(await persist(next, account, t("accounts.addFailed")))) {
        return false;
      }

      setSelectedAccount(account);
      toast.success(t("accounts.added"));
      return true;
    },
    [persist, setSelectedAccount, t],
  );

  const useAccount = useCallback(
    async (account: ILocalAccount) => {
      setBusyIdentity(accountIdentity(account));
      try {
        if ((await switchAccount(account)) === "failed") {
          showFailureToast(t("accounts.switchFailed"), undefined, {
            channels: ["accounts:save"],
            fallbackDescription: t("accounts.saveFailedHint"),
          });
        }
      } finally {
        setBusyIdentity(null);
      }
    },
    [t],
  );

  const removeAccount = useCallback(
    async (account: ILocalAccount) => {
      const identity = accountIdentity(account);
      const current = accountsRef.current;
      const next = current.filter(
        (entry) => accountIdentity(entry) !== identity,
      );

      const selectedIdentity = selectedAccount
        ? accountIdentity(selectedAccount)
        : null;
      const nextSelected = nextSelectionAfterRemoval(
        current,
        identity,
        selectedIdentity,
      ) as ILocalAccount | null;

      if (!(await persist(next, nextSelected, t("accounts.removeFailed")))) {
        return;
      }

      await clearSkinManager(account);

      setSelectedAccount(nextSelected ?? undefined);
      if (selectedIdentity === identity) setVersion(undefined);

      toast.success(t("accounts.deleted"));
    },
    [clearSkinManager, persist, selectedAccount, setSelectedAccount, setVersion, t],
  );

  const renewSession = useCallback(
    async (account: ILocalAccount) => {
      if (account.type === "plain" || !account.refreshToken) return false;

      const identity = accountIdentity(account);
      setBusyIdentity(identity);
      try {
        const subject = accountSubject(account) || account.id;
        if (!subject) return false;

        const refreshed =
          account.type === "microsoft"
            ? await api.auth.microsoftRefresh(account.refreshToken, subject)
            : account.type === "elyby"
              ? await api.auth.elybyRefresh(account.refreshToken, subject)
              : await api.auth.discordRefresh(account.refreshToken, subject);

        if (!refreshed?.accessToken) throw new Error("Empty refresh response");

        const updated: ILocalAccount = {
          ...account,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? account.refreshToken,
        };

        const next = accountsRef.current.map((entry) =>
          accountIdentity(entry) === identity ? updated : entry,
        );

        const stillSelected =
          selectedAccount && accountIdentity(selectedAccount) === identity;

        const saved = await persist(
          next,
          stillSelected ? updated : (selectedAccount ?? null),
          t("accounts.sessionRenewFailed"),
        );
        if (!saved) return false;

        if (stillSelected) setSelectedAccount(updated);

        toast.success(t("accounts.sessionRenewed"));
        return true;
      } catch (error) {
        showFailureToast(t("accounts.sessionRenewFailed"), error, {
          context: { side: authFailureSide(account.type) },
          fallbackDescription: t("accounts.sessionExpiredHint"),
        });
        return false;
      } finally {
        setBusyIdentity(null);
      }
    },
    [persist, selectedAccount, setSelectedAccount, t],
  );

  return {
    accounts,
    selectedAccount,
    progress,
    busyIdentity,
    signIn,
    cancelAuth,
    addOfflineAccount,
    useAccount,
    removeAccount,
    renewSession,
    reopenAuthWindow: useCallback(() => {
      if (progress) void api.shell.openExternal(progress.authUrl);
    }, [progress]),
  };
}

export type AccountsController = ReturnType<typeof useAccountsController>;
export type { AccountType };
