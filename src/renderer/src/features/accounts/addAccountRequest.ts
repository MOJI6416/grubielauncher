import { atom, getDefaultStore } from "jotai";
import { navigate } from "@renderer/navigation/navigate";

export const addAccountRequestAtom = atom(false);

export function openAddAccount(): void {
  getDefaultStore().set(addAccountRequestAtom, true);
  navigate({ name: "accounts" });
}

export function openAccounts(): void {
  navigate({ name: "accounts" });
}
