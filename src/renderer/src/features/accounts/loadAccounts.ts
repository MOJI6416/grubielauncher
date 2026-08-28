import { getDefaultStore } from "jotai";
import type { IAccountConf } from "@/types/Account";
import { resolveAccountBootstrap } from "@renderer/app/bootstrap/bootstrapPlan";
import {
  accountAtom,
  accountsAtom,
  accountsUnreadableAtom,
} from "@renderer/stores/atoms";
import { accountIdentity } from "./identity";

export async function loadAccounts(): Promise<boolean> {
  const store = getDefaultStore();
  const data: IAccountConf | null = await window.api.accounts.load();

  if (!data) {
    store.set(accountsUnreadableAtom, true);
    return false;
  }

  store.set(accountsUnreadableAtom, false);
  store.set(accountsAtom, data.accounts);

  const { account, persist } = resolveAccountBootstrap(
    data.accounts,
    data.lastPlayed,
  );

  if (!account) return true;

  store.set(accountAtom, account);
  if (persist) {
    await window.api.accounts.save(data.accounts, accountIdentity(account));
  }

  return true;
}
