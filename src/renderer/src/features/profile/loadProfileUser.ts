import { getDefaultStore } from "jotai";
import { accountAtom, accountsAtom, authDataAtom } from "@renderer/stores/atoms";
import { ensureAccountSession } from "@renderer/utilities/accountSession";
import { ILocalAccount } from "@/types/Account";
import { IUser } from "@/types/IUser";

export const OWN_PROFILE_ID = "me";

export class ProfileUnavailableError extends Error {
  readonly code = "profile_unavailable";

  constructor() {
    super("Profile is unavailable without an online account");
    this.name = "ProfileUnavailableError";
  }
}

export function isProfileUnavailableError(
  error: unknown,
): error is ProfileUnavailableError {
  return error instanceof ProfileUnavailableError;
}

export async function ensureFreshAccount(): Promise<{
  account: ILocalAccount;
  sub: string;
}> {
  const store = getDefaultStore();
  const authData = store.get(authDataAtom);
  const selectedAccount = store.get(accountAtom);

  if (
    !authData ||
    !selectedAccount ||
    selectedAccount.type === "plain" ||
    !selectedAccount.accessToken
  ) {
    throw new ProfileUnavailableError();
  }

  const { account } = await ensureAccountSession({
    accounts: store.get(accountsAtom),
    authData,
    selectedAccount,
    setAccounts: (next) => store.set(accountsAtom, next),
    setSelectedAccount: (next) => store.set(accountAtom, next),
  });

  return { account, sub: authData.sub };
}

export async function loadProfileUser(userId: string): Promise<IUser> {
  const { account, sub } = await ensureFreshAccount();

  const user = await window.api.backend.getUser(
    account.accessToken || "",
    userId === OWN_PROFILE_ID ? sub : userId,
  );

  if (!user) throw new Error("getUser returned nothing");

  return user;
}
