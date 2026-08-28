import { useCallback, useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { SkinsData } from "@/types/SkinManager";
import {
  accountAtom,
  authDataAtom,
  pathsAtom,
} from "@renderer/stores/atoms";

const api = window.api;

export type SkinsStatus = "loading" | "ready" | "error";

export function useSkinsData() {
  const paths = useAtomValue(pathsAtom);
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);

  const [data, setData] = useState<SkinsData | null>(null);
  const [status, setStatus] = useState<SkinsStatus>("loading");

  const accessToken =
    account?.type === "microsoft"
      ? (authData?.auth?.accessToken ?? "")
      : (account?.accessToken ?? "");

  const load = useCallback(async () => {
    if (!account || !authData) return null;

    return await api.skins.load(
      paths.launcher,
      account.type as "microsoft" | "discord" | "elyby",
      authData.uuid || "",
      account.nickname || "",
      accessToken,
    );
  }, [account, authData, paths.launcher, accessToken]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    void (async () => {
      try {
        const next = await load();
        if (cancelled) return;

        setData(next);
        setStatus(next ? "ready" : "error");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  const reload = useCallback(async () => {
    try {
      const next = await load();
      if (next) {
        setData(next);
        setStatus("ready");
      }
      return next;
    } catch {
      setStatus("error");
      return null;
    }
  }, [load]);

  return {
    data,
    setData,
    status,
    reload,
    account,
    authData,
    backendToken: account?.accessToken,
  };
}
