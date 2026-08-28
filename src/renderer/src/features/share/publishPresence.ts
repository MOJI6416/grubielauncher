import { getDefaultStore } from "jotai";
import type { IUpdateStatus } from "@/types/IFriend";
import { friendSocketAtom, ownPresenceAtom } from "@renderer/stores/atoms";

export function nextPresenceForShareCode(
  presence: Required<IUpdateStatus>,
  versionName: string,
  shareCode: string,
): Required<IUpdateStatus> | null {
  if (!versionName || presence.versionName !== versionName) return null;
  if ((presence.versionCode || "") === shareCode) return null;

  return { ...presence, versionCode: shareCode };
}

export function announceShareCode(versionName: string, shareCode: string) {
  const store = getDefaultStore();
  const next = nextPresenceForShareCode(
    store.get(ownPresenceAtom),
    versionName,
    shareCode,
  );
  if (!next) return;

  store.set(ownPresenceAtom, next);
  store.get(friendSocketAtom)?.emit("friendUpdate", next);
}
