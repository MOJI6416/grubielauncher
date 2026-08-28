import { getDefaultStore } from "jotai";
import type { ILocalAccount } from "@/types/Account";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
} from "@renderer/stores/atoms";
import { accountIdentity, accountUuid } from "./identity";

export type SwitchAccountResult = "switched" | "unchanged" | "failed";

export async function switchAccount(
  account: ILocalAccount,
): Promise<SwitchAccountResult> {
  const store = getDefaultStore();
  const identity = accountIdentity(account);
  const current = store.get(accountAtom);

  if (current && accountIdentity(current) === identity) return "unchanged";

  if (current) {
    try {
      await window.api.skins.clearManager(
        store.get(authDataAtom)?.uuid || accountUuid(current) || current.nickname,
        current.type,
      );
    } catch {}
  }

  const saved = await window.api.accounts.save(
    store.get(accountsAtom),
    identity,
  );
  if (!saved) return "failed";

  store.set(accountAtom, account);

  return "switched";
}
