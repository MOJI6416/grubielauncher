import { useEffect, useRef } from "react";
import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import {
  applyPresenceUpdate,
  sharePresenceKey,
} from "@renderer/features/friends/ownPresence";
import {
  friendSocketAtom,
  ownPresenceAtom,
  shareStateAtom,
} from "@renderer/stores/atoms";

const api = window.api;

export function PresenceHost() {
  const [ownPresence, setOwnPresence] = useAtom(ownPresenceAtom);
  const shareState = useAtomValue(shareStateAtom);
  const previousBroadcastRef = useRef("offline");

  useEffect(() => {
    return api.events.onFriendUpdate((data) => {
      setOwnPresence((prev) => applyPresenceUpdate(prev, data));
      getDefaultStore()
        .get(friendSocketAtom)
        ?.emit("friendUpdate", { ...data });
    });
  }, [setOwnPresence]);

  useEffect(() => {
    if (!ownPresence.versionName || !ownPresence.versionCode) return;

    const nextKey = sharePresenceKey(shareState);
    if (previousBroadcastRef.current === nextKey) return;

    previousBroadcastRef.current = nextKey;
    getDefaultStore()
      .get(friendSocketAtom)
      ?.emit("friendUpdate", { ...ownPresence });
  }, [
    ownPresence,
    shareState.phase,
    shareState.publicAddress,
    shareState.sessionId,
    shareState.slug,
    shareState.visibility,
  ]);

  return null;
}
