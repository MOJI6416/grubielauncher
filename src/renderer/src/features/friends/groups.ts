import { getDefaultStore } from "jotai";
import { accountIdentity } from "@renderer/features/accounts/identity";
import {
  accountAtom,
  groupsAtom,
  groupsLoadFailedAtom,
} from "@renderer/stores/atoms";

const api = window.api;

export async function loadGroups(): Promise<boolean> {
  const store = getDefaultStore();
  const account = store.get(accountAtom);
  const token = account?.accessToken;

  if (!account || !token) {
    store.set(groupsAtom, []);
    store.set(groupsLoadFailedAtom, false);
    return true;
  }

  const identity = accountIdentity(account);
  const groups = await api.backend.groupsList(token);

  const current = store.get(accountAtom);
  if (!current || accountIdentity(current) !== identity) return true;

  if (!groups) {
    store.set(groupsLoadFailedAtom, true);
    return false;
  }

  store.set(groupsLoadFailedAtom, false);
  store.set(groupsAtom, groups);
  return true;
}
