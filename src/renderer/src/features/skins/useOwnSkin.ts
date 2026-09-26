import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import type { ISkinData } from "@/types/Skin";
import {
  accountAtom,
  authDataAtom,
  rpcSkinVersionAtom,
} from "@renderer/stores/atoms";

const api = window.api;
const skinCache = new Map<string, ISkinData | null>();

export function useOwnSkin(enabled: boolean): ISkinData | null {
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const skinVersion = useAtomValue(rpcSkinVersionAtom);
  const type = account?.type ?? "plain";
  const nickname = account?.nickname ?? "";
  const cacheKey = `${type}:${nickname}:${skinVersion}`;
  const accessToken =
    type === "microsoft" ? authData?.auth?.accessToken : account?.accessToken;
  const uuid = authData?.uuid ?? "";
  const [skin, setSkin] = useState<ISkinData | null>(
    () => skinCache.get(cacheKey) ?? null,
  );

  useEffect(() => {
    if (!enabled || type === "plain" || !nickname) {
      setSkin(null);
      return;
    }

    const cached = skinCache.get(cacheKey);
    if (cached !== undefined) {
      setSkin(cached);
      return;
    }

    let cancelled = false;
    void api.skin
      .get(type, uuid, nickname, accessToken)
      .then((data) => {
        skinCache.set(cacheKey, data);
        if (!cancelled) setSkin(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled, type, nickname, cacheKey, uuid, accessToken]);

  return skin;
}
