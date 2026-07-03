import { getDefaultStore } from "jotai";
import { activeFriendSharesAtom } from "@renderer/stores/atoms";
import { ActiveFriendShare } from "@/types/Share";

const api = window.api;

export async function refreshActiveFriendShares(): Promise<
  ActiveFriendShare[] | null
> {
  const result = await api.share.fetchActiveFriendShares();
  if (!result.ok || !result.data) return null;

  getDefaultStore().set(activeFriendSharesAtom, result.data);
  return result.data;
}

export function clearActiveFriendShares() {
  getDefaultStore().set(activeFriendSharesAtom, []);
}
