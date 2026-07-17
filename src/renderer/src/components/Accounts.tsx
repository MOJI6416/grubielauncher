import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const api = window.api;

import { FaDiscord, FaMicrosoft } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Loader2,
  Palette,
  Shirt,
  TriangleAlert,
  User,
  UserMinus,
  UserPlus,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { TbSquareLetterE } from "react-icons/tb";
import { IUser } from "@/types/IUser";
import { useAtom, useAtomValue } from "jotai";
import {
  accountAtom,
  accountsAtom,
  accountsModalAtom,
  authDataAtom,
  consolesMetaAtom,
  isRunningAtom,
  networkAtom,
  pathsAtom,
  pendingSkinDeepLinkAtom,
  selectedVersionAtom,
} from "@renderer/stores/atoms";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { IAuth, ILocalAccount } from "@/types/Account";
import { jwtDecode } from "jwt-decode";
import {
  DISCORD_CLIENT_ID,
  ELYBY_CLIENT_ID,
  MICROSOFT_CLIENT_ID,
} from "@/shared/config";
import { IAuthResponse } from "@/types/Auth";
import { Confirmation } from "./Modals/Confirmation";
import { MiniSkinWidget } from "./MiniSkinWidget";
import {
  ensureAccountSession,
  isAccountSessionRefreshError,
} from "@renderer/utilities/accountSession";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LazyDialogFallback } from "./LazyDialogFallback";
import {
  lazyWithPreload,
  preload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";

const loadAccountInfo = () => import("./Account/AccountInfo");
const LazyAccountInfo = lazyWithPreload(loadAccountInfo);

function accountInitials(nickname: string) {
  return nickname.slice(0, 2).toUpperCase();
}

function ProviderIcon({
  type,
  size = 18,
}: {
  type: ILocalAccount["type"];
  size?: number;
}) {
  if (type == "microsoft") return <FaMicrosoft size={size} />;
  if (type == "elyby") return <TbSquareLetterE size={size} />;
  if (type == "discord") return <FaDiscord size={size} />;
  return <User size={size} />;
}

function providerLabel(
  type: ILocalAccount["type"],
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (type === "microsoft") return t("accounts.microsoft");
  if (type === "elyby") return t("accounts.elyby");
  if (type === "discord") return "Discord";
  return t("accounts.plainAccount").replace(/\s*\(.+?\)\s*/g, "");
}

function ProviderText({
  title,
  icon,
  feature,
  highlight,
}: {
  title: string;
  icon: ReactNode;
  feature: string;
  highlight?: boolean;
}) {
  return (
    <span className="grid gap-1.5">
      <span className="font-medium leading-tight">{title}</span>
      <Badge
        variant={highlight ? "default" : "outline"}
        className="h-auto justify-start whitespace-normal text-left font-normal leading-tight"
      >
        {icon}
        {feature}
      </Badge>
    </span>
  );
}

function getAccountSubject(account: Pick<ILocalAccount, "accessToken">) {
  if (!account.accessToken) return null;

  try {
    return jwtDecode<IAuth>(account.accessToken).sub || null;
  } catch {
    return null;
  }
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function AccountAvatar({
  account,
  size,
  className,
}: {
  account: ILocalAccount;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar className={className} size={size}>
      <AvatarImage src={account.image || ""} alt={account.nickname} />
      <AvatarFallback>{accountInitials(account.nickname)}</AvatarFallback>
    </Avatar>
  );
}

export function Accounts() {
  const [modalSelectIsOpen, setIsOpenModalSelect] = useAtom(accountsModalAtom);
  const [modalAddIsOpen, setIsOpenModalAdd] = useState(false);
  const [modalPlainIsOpen, setIsOpenModalPlain] = useState(false);
  const [paths] = useAtom(pathsAtom);
  const [nickname, setNickname] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [signType, setSignType] = useState<"microsoft" | "elyby" | "discord">();
  const [authStage, setAuthStage] = useState<"idle" | "waiting" | "exchanging">(
    "idle",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"avatar" | "skin" | "user">();
  const [accountInfo, setAccountInfo] = useState(false);
  const [user, setUser] = useState<IUser | undefined>();
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const { t } = useTranslation();
  const [isNetwork] = useAtom(networkAtom);
  const [isRunning] = useAtom(isRunningAtom);
  const [authData, setAuthData] = useAtom(authDataAtom);
  const consoleMetas = useAtomValue(consolesMetaAtom);
  const [, setVersion] = useAtom(selectedVersionAtom);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  const accountsSafe = accounts ?? [];

  const authSessionRef = useRef(0);
  const accountsRef = useRef(accountsSafe);
  useEffect(() => {
    accountsRef.current = accountsSafe;
  }, [accountsSafe]);

  useEffect(() => {
    if (!selectedAccount || selectedAccount.type === "plain" || !isNetwork) {
      return;
    }
    return schedulePreload([LazyAccountInfo.preload], 1200);
  }, [selectedAccount, isNetwork]);

  const openAccountInfo = useCallback(async () => {
    if (
      isLoading ||
      !selectedAccount ||
      selectedAccount.type === "plain" ||
      !isNetwork ||
      !authData ||
      !selectedAccount.accessToken
    )
      return;

    setIsLoading(true);
    setLoadingType("user");
    try {
      const accountForRequest = (
        await ensureAccountSession({
          accounts: accountsSafe,
          authData,
          selectedAccount,
          setAccounts,
          setSelectedAccount,
        })
      ).account;

      const nextUser = await api.backend.getUser(
        accountForRequest.accessToken || "",
        authData.sub,
      );
      if (nextUser) {
        setUser(nextUser);
        setAccountInfo(true);
        return;
      }
      throw new Error();
    } catch (err) {
      toast.error(
        t(
          isAccountSessionRefreshError(err)
            ? "accounts.sessionExpired"
            : "accountInfo.error",
        ),
      );
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }, [
    isLoading,
    selectedAccount,
    isNetwork,
    authData,
    accountsSafe,
    setAccounts,
    setSelectedAccount,
    t,
  ]);

  const pendingSkinDeepLink = useAtomValue(pendingSkinDeepLinkAtom);
  const handledSkinDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingSkinDeepLink) {
      handledSkinDeepLinkRef.current = null;
      return;
    }
    if (handledSkinDeepLinkRef.current === pendingSkinDeepLink) return;
    handledSkinDeepLinkRef.current = pendingSkinDeepLink;
    if (!accountInfo) void openAccountInfo();
  }, [pendingSkinDeepLink, accountInfo, openAccountInfo]);

  const getAccountKey = useCallback(
    (a: ILocalAccount) => `${a.type}_${a.nickname}`,
    [],
  );

  const closeModalSelect = useCallback(() => {
    setIsOpenModalSelect(false);
  }, []);

  const openModalSelect = useCallback(() => {
    setIsOpenModalSelect(true);
  }, []);

  const closeModalAdd = useCallback(() => {
    setNickname("");
    setIsOpenModalAdd(false);
  }, []);

  const closeModalPlain = useCallback(() => {
    setNickname("");
    setIsOpenModalPlain(false);
  }, []);

  const openModalAdd = useCallback(() => {
    authSessionRef.current++;
    setIsSigning(false);
    setSignType(undefined);
    setAuthStage("idle");
    setIsOpenModalAdd(true);
  }, []);

  const openModalPlain = useCallback(() => {
    setNickname("");
    setIsOpenModalAdd(false);
    setIsOpenModalPlain(true);
  }, []);

  const oauth = useCallback(
    async (
      provider: "microsoft" | "elyby" | "discord",
      code: string,
      sessionId: number,
    ) => {
      try {
        if (!paths.launcher) return;

        let authUser: IAuthResponse | null = null;
        if (provider === "microsoft") authUser = await api.auth.microsoft(code);
        else if (provider === "elyby") authUser = await api.auth.elyby(code);
        else authUser = await api.auth.discord(code);

        if (authSessionRef.current !== sessionId) return;

        if (!authUser) throw new Error();

        const current = accountsRef.current;
        const authSubject = getAccountSubject(authUser);
        const existingIndex = current.findIndex((account) => {
          if (account.type !== provider) return false;
          const accountSubject = getAccountSubject(account);
          return authSubject
            ? accountSubject === authSubject
            : account.nickname === authUser!.nickname;
        });

        const account: ILocalAccount = {
          ...authUser,
          type: provider,
          image: authUser.image || "",
          friends:
            existingIndex >= 0 ? current[existingIndex].friends || [] : [],
        };

        const nextAccounts =
          existingIndex >= 0
            ? current.map((item, index) =>
                index === existingIndex ? account : item,
              )
            : [...current, account];

        setAccounts(nextAccounts);
        await api.accounts.save(nextAccounts, getAccountKey(account));

        setSelectedAccount(account);
        closeModalSelect();
        closeModalAdd();
        closeModalPlain();

        setIsSigning(false);
        setSignType(undefined);
        setAuthStage("idle");

        toast.success(
          existingIndex >= 0 ? t("accountInfo.updated") : t("accounts.added"),
        );
      } catch (err) {
        if (authSessionRef.current !== sessionId) return;
        setIsSigning(false);
        setSignType(undefined);
        setAuthStage("idle");
        toast.error(t("accounts.failedLogIn"));
      }
    },
    [
      paths.launcher,
      setAccounts,
      setSelectedAccount,
      t,
      closeModalSelect,
      closeModalAdd,
      closeModalPlain,
      getAccountKey,
    ],
  );

  useEffect(() => {
    if (!selectedAccount || !selectedAccount?.accessToken) {
      setAuthData(null);
      return;
    }

    try {
      const decode = jwtDecode<IAuth>(selectedAccount.accessToken);
      setAuthData(decode);
    } catch {
      setAuthData(null);
    }
  }, [selectedAccount, setAuthData]);

  const addPlainAccount = useCallback(async () => {
    if (!paths.launcher) return;
    const nick = nickname.trim();
    if (!nick) return;

    const current = accountsRef.current;
    const exists = current.some(
      (a) => a.nickname === nick && a.type === "plain",
    );
    if (exists) {
      toast.warning(t("accounts.exists"));
      return;
    }

    const account: ILocalAccount = {
      nickname: nick,
      type: "plain",
      image: "",
      friends: [],
    };

    const nextAccounts = [...current, account];

    setAccounts(nextAccounts);
    await api.accounts.save(nextAccounts, getAccountKey(account));

    setSelectedAccount(account);
    closeModalSelect();
    closeModalAdd();
    closeModalPlain();
    toast.success(t("accounts.added"));
  }, [
    nickname,
    paths.launcher,
    setAccounts,
    setSelectedAccount,
    t,
    closeModalSelect,
    closeModalAdd,
    closeModalPlain,
    getAccountKey,
  ]);

  const selectAccount = useCallback(
    async (value: string) => {
      const current = accountsRef.current;
      const account = current.find((a) => getAccountKey(a) === value);
      if (!account) return;

      if (selectedAccount) {
        try {
          await api.skins.clearManager(
            authData?.uuid || selectedAccount.nickname,
            selectedAccount.type,
          );
        } catch {}
      }

      setSelectedAccount(account);
      setVersion(undefined);

      await api.accounts.save(current, getAccountKey(account));
    },
    [selectedAccount, setSelectedAccount, authData, setVersion, getAccountKey],
  );

  const deleteAccount = useCallback(async () => {
    if (!paths.launcher) return;
    if (!selectedAccount) return;

    const current = accountsRef.current;
    const keyToRemove = getAccountKey(selectedAccount);

    const nextAccounts = current.filter(
      (a) => getAccountKey(a) !== keyToRemove,
    );

    try {
      await api.skins.clearManager(
        authData?.uuid || selectedAccount.nickname,
        selectedAccount.type,
      );
    } catch {}

    const nextSelected = nextAccounts[0];

    setAccounts(nextAccounts);
    setSelectedAccount(nextSelected);

    await api.accounts.save(
      nextAccounts,
      nextSelected ? getAccountKey(nextSelected) : null,
    );

    toast.success(t("accounts.deleted"));
  }, [
    paths.launcher,
    selectedAccount,
    setAccounts,
    setSelectedAccount,
    t,
    authData,
    getAccountKey,
  ]);

  async function Auth(type: "microsoft" | "elyby" | "discord") {
    const state = `${type}:${crypto.randomUUID()}`;
    let authUrl = "";
    if (type === "microsoft")
      authUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:53213/callback&scope=XboxLive.signin%20offline_access&state=${encodeURIComponent(state)}`;
    else if (type === "elyby")
      authUrl = `https://account.ely.by/oauth2/v1?client_id=${ELYBY_CLIENT_ID}&redirect_uri=http://localhost:53213/callback&response_type=code&scope=offline_access,account_info,minecraft_server_session&state=${encodeURIComponent(state)}`;
    else
      authUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A53213%2Fcallback&scope=identify+guilds.join&state=${encodeURIComponent(state)}`;

    const sessionId = ++authSessionRef.current;

    setSignType(type);
    setIsSigning(true);
    setAuthStage("waiting");
    const waitForOAuth = api.auth.startServer(state);

    try {
      await api.shell.openExternal(authUrl);
      const { provider, code } = await waitForOAuth;

      if (authSessionRef.current !== sessionId) return;
      if (
        provider !== "microsoft" &&
        provider !== "discord" &&
        provider !== "elyby"
      ) {
        return;
      }
      setAuthStage("exchanging");
      closeModalSelect();
      await waitForNextFrame();
      await oauth(provider, code, sessionId);
    } catch {
      if (authSessionRef.current !== sessionId) return;
      setIsSigning(false);
      setSignType(undefined);
      setAuthStage("idle");
      toast.error(t("accounts.failedLogIn"));
    }
  }

  const selectedKey = selectedAccount
    ? `${selectedAccount.type}_${selectedAccount.nickname}`
    : "";
  const trimmedNickname = nickname.trim();
  const isPlainNicknameInvalid =
    trimmedNickname === "" ||
    !!accountsSafe.find(
      (a) => a.nickname == trimmedNickname && a.type == "plain",
    ) ||
    trimmedNickname.length < 3 ||
    trimmedNickname.length > 16;
  const showNicknameError = trimmedNickname !== "" && isPlainNicknameInvalid;
  const nicknameErrorId = "plain-account-nickname-error";

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {selectedAccount ? (
          <>
            <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-1.5 py-1">
              <button
                type="button"
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selectedAccount.type != "plain" && isNetwork
                    ? "cursor-pointer"
                    : "cursor-default",
                )}
                onClick={async (event) => {
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("[data-account-click-ignore='true']")) {
                    return;
                  }
                  await openAccountInfo();
                }}
                onMouseEnter={() => preload(LazyAccountInfo.preload)}
                onFocus={() => preload(LazyAccountInfo.preload)}
              >
                <AccountAvatar
                  account={selectedAccount}
                  className="h-9 w-9 flex-shrink-0"
                />
                <div className="grid min-w-0 gap-0.5 py-0.5">
                  <p className="truncate text-sm font-medium leading-5">
                    {selectedAccount.nickname}
                  </p>
                  <div className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
                    <ProviderIcon type={selectedAccount.type} size={14} />
                    <span className="truncate">
                      {providerLabel(selectedAccount.type, t)}
                    </span>
                  </div>
                </div>
              </button>
              <MiniSkinWidget />
              {isLoading && loadingType == "user" && (
                <Loader2 className="size-4 animate-spin" />
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              disabled={isRunning}
              onClick={openModalSelect}
            >
              <ChevronDown className="flex-shrink-0" size={18} />
              {t("accounts.accounts")}
            </Button>
          </>
        ) : (
          <>
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>{t("accounts.notSelected")}</AlertTitle>
            </Alert>
            <div>
              <Button
                variant="secondary"
                size="sm"
                className="animate-pulse"
                onClick={
                  accountsSafe.length != 0 ? openModalSelect : openModalAdd
                }
              >
                <User size={18} />
                {t("accounts.select")}
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog
        open={modalSelectIsOpen}
        onOpenChange={(open) => {
          if (!open) closeModalSelect();
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5" />
              {t("accounts.accountSelection")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <ScrollArea className="max-h-72 rounded-lg border bg-card">
              <div className="grid gap-2 p-2">
                {accountsSafe.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t("accounts.notSelected")}
                  </div>
                ) : (
                  accountsSafe.map((account) => {
                    const key = getAccountKey(account);
                    const isSelected = key === selectedKey;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={cn(
                          "flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isSelected && "border-primary bg-accent",
                        )}
                        onClick={async () => {
                          await selectAccount(key);
                        }}
                      >
                        <AccountAvatar
                          account={account}
                          className="h-10 w-10 shrink-0"
                        />
                        <div className="grid min-w-0 flex-1 gap-0.5">
                          <p className="truncate text-sm font-medium">
                            {account.nickname}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ProviderIcon type={account.type} size={14} />
                            <span>{providerLabel(account.type, t)}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="size-4 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="gap-2 sm:justify-between">
              {selectedAccount ? (
                <Button
                  variant="destructive"
                  disabled={consoleMetas.some(
                    (c) => c.status == "running",
                  )}
                  onClick={() => setIsConfirmationOpen(true)}
                >
                  <UserMinus className="size-4" />
                  {t("accounts.delete")}
                </Button>
              ) : null}

              <Button variant="secondary" onClick={openModalAdd}>
                <UserPlus className="size-4" />
                {t("common.add")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modalAddIsOpen}
        onOpenChange={(open) => {
          if (!open && !isSigning) closeModalAdd();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="sm:max-w-lg"
          onEscapeKeyDown={(event) => {
            if (isSigning) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isSigning) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5" />
              {t("accounts.addingAccount")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto items-start justify-start gap-3 whitespace-normal bg-card p-3 text-left hover:bg-accent"
                disabled={isSigning}
                onClick={openModalPlain}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-foreground">
                  <User size={20} />
                </span>
                <ProviderText
                  title={providerLabel("plain", t)}
                  icon={<WifiOff />}
                  feature={t("accounts.providerFeature.plain")}
                />
              </Button>

              <Button
                variant={
                  isSigning && signType == "discord" && authStage === "waiting"
                    ? "destructive"
                    : "outline"
                }
                className="h-auto items-start justify-start gap-3 whitespace-normal bg-card p-3 text-left hover:bg-accent"
                disabled={
                  (isSigning && signType != "discord") ||
                  authStage === "exchanging" ||
                  !isNetwork
                }
                onClick={async () => {
                  if (isSigning && authStage === "waiting") {
                    authSessionRef.current++;
                    setIsSigning(false);
                    setSignType(undefined);
                    setAuthStage("idle");
                    toast.success(t("accounts.cancelled"));
                    return;
                  }
                  await Auth("discord");
                }}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-foreground">
                  {isSigning &&
                  signType == "discord" &&
                  authStage === "exchanging" ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : isSigning &&
                    signType == "discord" &&
                    authStage === "waiting" ? (
                    <X size={20} />
                  ) : (
                    <FaDiscord size={20} />
                  )}
                </span>
                <ProviderText
                  title={
                    isSigning &&
                    signType == "discord" &&
                    authStage === "waiting"
                      ? t("common.cancel")
                      : "Discord"
                  }
                  icon={<Palette />}
                  feature={t("accounts.providerFeature.discord")}
                  highlight
                />
              </Button>

              <Button
                variant={
                  isSigning &&
                  signType == "microsoft" &&
                  authStage === "waiting"
                    ? "destructive"
                    : "outline"
                }
                className="h-auto items-start justify-start gap-3 whitespace-normal bg-card p-3 text-left hover:bg-accent"
                disabled={
                  (isSigning && signType != "microsoft") ||
                  authStage === "exchanging" ||
                  !isNetwork
                }
                onClick={async () => {
                  if (isSigning && authStage === "waiting") {
                    authSessionRef.current++;
                    setIsSigning(false);
                    setSignType(undefined);
                    setAuthStage("idle");
                    toast.success(t("accounts.cancelled"));
                    return;
                  }
                  await Auth("microsoft");
                }}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-foreground">
                  {isSigning &&
                  signType == "microsoft" &&
                  authStage === "exchanging" ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : isSigning &&
                    signType == "microsoft" &&
                    authStage === "waiting" ? (
                    <X size={20} />
                  ) : (
                    <FaMicrosoft size={20} />
                  )}
                </span>
                <ProviderText
                  title={
                    isSigning &&
                    signType == "microsoft" &&
                    authStage === "waiting"
                      ? t("common.cancel")
                      : t("accounts.microsoft")
                  }
                  icon={<BadgeCheck />}
                  feature={t("accounts.providerFeature.microsoft")}
                />
              </Button>

              <Button
                variant={
                  isSigning && signType == "elyby" && authStage === "waiting"
                    ? "destructive"
                    : "outline"
                }
                className="h-auto items-start justify-start gap-3 whitespace-normal bg-card p-3 text-left hover:bg-accent"
                disabled={
                  (isSigning && signType != "elyby") ||
                  authStage === "exchanging" ||
                  !isNetwork
                }
                onClick={async () => {
                  if (isSigning && authStage === "waiting") {
                    authSessionRef.current++;
                    setIsSigning(false);
                    setSignType(undefined);
                    setAuthStage("idle");
                    toast.success(t("accounts.cancelled"));
                    return;
                  }
                  await Auth("elyby");
                }}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-foreground">
                  {isSigning &&
                  signType == "elyby" &&
                  authStage === "exchanging" ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : isSigning &&
                    signType == "elyby" &&
                    authStage === "waiting" ? (
                    <X size={20} />
                  ) : (
                    <TbSquareLetterE size={20} />
                  )}
                </span>
                <ProviderText
                  title={
                    isSigning && signType == "elyby" && authStage === "waiting"
                      ? t("common.cancel")
                      : t("accounts.elyby")
                  }
                  icon={<Shirt />}
                  feature={t("accounts.providerFeature.elyby")}
                />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modalPlainIsOpen}
        onOpenChange={(open) => {
          if (!open) closeModalPlain();
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5" />
              {providerLabel("plain", t)}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="plain-account-nickname">
                {t("accounts.nickname")}
              </Label>
              <div className="grid min-w-0">
                <Input
                  id="plain-account-nickname"
                  placeholder="Notch"
                  aria-invalid={showNicknameError}
                  aria-describedby={
                    showNicknameError ? nicknameErrorId : undefined
                  }
                  value={nickname}
                  autoFocus
                  onChange={(event) => setNickname(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !isPlainNicknameInvalid) {
                      void addPlainAccount();
                    }
                  }}
                />
                <FormErrorMessage show={showNicknameError} id={nicknameErrorId}>
                  {t("accounts.invalidNickname")}
                </FormErrorMessage>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="secondary" onClick={closeModalPlain}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={isPlainNicknameInvalid}
                onClick={async () => await addPlainAccount()}
              >
                <UserPlus size={18} />
                {t("common.add")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {accountInfo && selectedAccount && user && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyAccountInfo
            onClose={() => {
              setAccountInfo(false);
            }}
            user={user}
            isOwner={true}
          />
        </Suspense>
      )}

      {isConfirmationOpen && selectedAccount && (
        <Confirmation
          content={[
            {
              text: t("accounts.confirmation", {
                nickname: selectedAccount.nickname,
              }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              onClick: async () => {
                await deleteAccount();
                setIsConfirmationOpen(false);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setIsConfirmationOpen(false),
            },
          ]}
          onClose={() => setIsConfirmationOpen(false)}
        />
      )}
    </>
  );
}
