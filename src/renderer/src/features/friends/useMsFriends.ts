import { useCallback, useEffect, useRef, useState } from "react";
import type { ILocalAccount } from "@/types/Account";
import type {
  MsFriendAction,
  MsFriendsError,
  MsFriendsResult,
  MsFriendsSnapshot,
} from "@/shared/msFriends";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { mergeSnapshot } from "./msFriendsModel";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;
const REFRESH_MS = 2 * 60_000;

export interface MsFriendsState {
  isAvailable: boolean;
  snapshot: MsFriendsSnapshot | null;
  error: MsFriendsError | null;
  pending: string[];
  act: (
    action: MsFriendAction,
    target: { profileId?: string; name?: string },
  ) => Promise<MsFriendsError | null>;
}

export function useMsFriends(account: ILocalAccount | null | undefined): MsFriendsState {
  const token = account?.type === "microsoft" ? account.accessToken ?? "" : "";
  const [snapshot, setSnapshot] = useState<MsFriendsSnapshot | null>(null);
  const [error, setError] = useState<MsFriendsError | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const apply = useCallback((result: MsFriendsResult, forToken: string) => {
    if (tokenRef.current !== forToken) return;
    if (result.ok) {
      setSnapshot((previous) => mergeSnapshot(previous, result.data));
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    if (!token) return;

    let cancelled = false;
    const load = () => {
      void api.msFriends
        .get(token)
        .then((result) => {
          if (!cancelled) apply(result, token);
        }, ignoreFailure);
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, apply]);

  const act = useCallback(
    async (
      action: MsFriendAction,
      target: { profileId?: string; name?: string },
    ): Promise<MsFriendsError | null> => {
      countFeature(
        action === "add"
          ? "msFriends.add"
          : action === "accept"
            ? "msFriends.accept"
            : "msFriends.remove",
      );
      const forToken = tokenRef.current;
      if (!forToken) return "not_microsoft";
      const key = target.profileId ?? target.name ?? "";
      setPending((previous) => [...previous, key]);
      try {
        const result = await api.msFriends.update(forToken, action, target);
        apply(result, forToken);
        return result.ok ? null : result.error;
      } catch {
        return "unavailable";
      } finally {
        setPending((previous) => previous.filter((item) => item !== key));
      }
    },
    [apply],
  );

  return { isAvailable: !!token, snapshot, error, pending, act };
}
