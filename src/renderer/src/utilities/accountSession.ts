import { IAuth, ILocalAccount } from "@/types/Account";
import { IRefreshTokenResponse } from "@/types/Auth";

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

function isJwtExpired(authData: IAuth) {
  return typeof authData.exp !== "number" || Date.now() / 1000 >= authData.exp;
}

function isProviderExpired(authData: IAuth) {
  return (
    typeof authData.auth?.expiresAt !== "number" ||
    Date.now() >= authData.auth.expiresAt
  );
}

async function refreshAccountToken(
  account: ILocalAccount,
  authData: IAuth,
): Promise<IRefreshTokenResponse | null> {
  const refreshToken = authData.auth?.refreshToken;
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

  const authUser = await refreshAccountToken(selectedAccount, authData);
  if (!authUser?.accessToken) {
    throw new Error("Refresh failed");
  }

  const nextAccount: ILocalAccount = {
    ...selectedAccount,
    accessToken: authUser.accessToken,
  };

  const nextAccounts = accounts.map((account) =>
    account.nickname === selectedAccount.nickname &&
    account.type === selectedAccount.type
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
