import { IAuth, ILocalAccount } from "@/types/Account";
import { IRefreshTokenResponse } from "@/types/Auth";
import { jwtDecode } from "jwt-decode";

const api = window.api;

type EnsureAccountSessionParams = {
  accounts: ILocalAccount[];
  authData: IAuth;
  selectedAccount: ILocalAccount;
  setAccounts: (accounts: ILocalAccount[]) => void;
  setSelectedAccount: (account: ILocalAccount) => void;
};

type EnsureAccountSessionResult = {
  account: ILocalAccount;
  accounts: ILocalAccount[];
  refreshed: boolean;
};

export class AccountSessionRefreshError extends Error {
  readonly code = "account_session_refresh_failed";
  readonly provider: ILocalAccount["type"];

  constructor(provider: ILocalAccount["type"]) {
    super("Account session refresh failed");
    this.name = "AccountSessionRefreshError";
    this.provider = provider;
  }
}

export function isAccountSessionRefreshError(
  error: unknown,
): error is AccountSessionRefreshError {
  return (
    error instanceof AccountSessionRefreshError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "account_session_refresh_failed")
  );
}

function isJwtExpired(authData: IAuth) {
  return typeof authData.exp !== "number" || Date.now() / 1000 >= authData.exp;
}

function isProviderExpired(authData: IAuth) {
  return (
    typeof authData.auth?.expiresAt !== "number" ||
    Date.now() >= authData.auth.expiresAt
  );
}

function decodeAuthData(token?: string): IAuth | null {
  if (!token) return null;

  try {
    return jwtDecode<IAuth>(token);
  } catch {
    return null;
  }
}

function shouldRefreshAuth(authData: IAuth) {
  return isJwtExpired(authData) || isProviderExpired(authData);
}

function isSameSessionAccount(
  account: ILocalAccount,
  selectedAccount: ILocalAccount,
  subject?: string,
) {
  if (account.type !== selectedAccount.type) return false;

  const accountSubject = decodeAuthData(account.accessToken)?.sub;
  if (subject && accountSubject) return accountSubject === subject;

  return account.nickname === selectedAccount.nickname;
}

async function loadStoredSession(
  selectedAccount: ILocalAccount,
  authData: IAuth,
): Promise<{
  account: ILocalAccount;
  accounts: ILocalAccount[];
  authData: IAuth;
} | null> {
  try {
    const stored = await api.accounts.load();
    const account = stored.accounts.find((entry) =>
      isSameSessionAccount(entry, selectedAccount, authData.sub),
    );
    const decoded = decodeAuthData(account?.accessToken);

    if (!account || !decoded || decoded.sub !== authData.sub) return null;

    return {
      account,
      accounts: stored.accounts,
      authData: decoded,
    };
  } catch {
    return null;
  }
}

async function refreshAccountToken(
  account: ILocalAccount,
  authData: IAuth,
): Promise<IRefreshTokenResponse | null> {
  const refreshToken = account.refreshToken;
  if (!refreshToken || !authData.sub) return null;

  if (account.type === "microsoft") {
    return await api.auth.microsoftRefresh(refreshToken, authData.sub);
  }

  if (account.type === "elyby") {
    return await api.auth.elybyRefresh(refreshToken, authData.sub);
  }

  if (account.type === "discord") {
    return await api.auth.discordRefresh(refreshToken, authData.sub);
  }

  return null;
}

export async function ensureAccountSession(
  params: EnsureAccountSessionParams,
): Promise<EnsureAccountSessionResult> {
  const {
    accounts,
    authData,
    selectedAccount,
    setAccounts,
    setSelectedAccount,
  } = params;

  if (
    !selectedAccount.accessToken ||
    selectedAccount.type === "plain" ||
    !authData?.auth
  ) {
    return {
      account: selectedAccount,
      accounts,
      refreshed: false,
    };
  }

  const shouldRefresh = isJwtExpired(authData) || isProviderExpired(authData);
  if (!shouldRefresh) {
    return {
      account: selectedAccount,
      accounts,
      refreshed: false,
    };
  }

  let accountForRefresh = selectedAccount;
  let accountsForRefresh = accounts;
  let authDataForRefresh = authData;

  const storedSession = await loadStoredSession(selectedAccount, authData);
  if (storedSession) {
    if (storedSession.account.accessToken !== selectedAccount.accessToken) {
      if (!shouldRefreshAuth(storedSession.authData)) {
        setSelectedAccount(storedSession.account);
        setAccounts(storedSession.accounts);

        return {
          account: storedSession.account,
          accounts: storedSession.accounts,
          refreshed: true,
        };
      }
    }

    accountForRefresh = storedSession.account;
    accountsForRefresh = storedSession.accounts;
    authDataForRefresh = storedSession.authData;
  }

  const authUser = await refreshAccountToken(
    accountForRefresh,
    authDataForRefresh,
  );
  if (!authUser?.accessToken) {
    const fallbackSession = await loadStoredSession(
      accountForRefresh,
      authDataForRefresh,
    );
    if (
      fallbackSession &&
      fallbackSession.account.accessToken !== accountForRefresh.accessToken &&
      !shouldRefreshAuth(fallbackSession.authData)
    ) {
      setSelectedAccount(fallbackSession.account);
      setAccounts(fallbackSession.accounts);

      return {
        account: fallbackSession.account,
        accounts: fallbackSession.accounts,
        refreshed: true,
      };
    }

    throw new AccountSessionRefreshError(accountForRefresh.type);
  }

  const nextAccount: ILocalAccount = {
    ...accountForRefresh,
    accessToken: authUser.accessToken,
    refreshToken: authUser.refreshToken,
  };

  const nextAccounts = accountsForRefresh.map((account) =>
    isSameSessionAccount(account, accountForRefresh, authDataForRefresh.sub)
      ? nextAccount
      : account,
  );

  setSelectedAccount(nextAccount);
  setAccounts(nextAccounts);

  await api.accounts.save(
    nextAccounts,
    `${nextAccount.type}_${nextAccount.nickname}`,
  );

  return {
    account: nextAccount,
    accounts: nextAccounts,
    refreshed: true,
  };
}
