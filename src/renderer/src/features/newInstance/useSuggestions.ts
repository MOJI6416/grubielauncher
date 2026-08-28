import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import type { IModpack } from "@/types/Backend";
import { accountAtom, versionsAtom } from "@renderer/stores/atoms";
import { useInstalledShareCodes } from "@renderer/features/community/installedPacks";

const api = window.api;

export interface OwnModpacksState {
  items: IModpack[];
  isLoading: boolean;
  installed: Map<string, string>;
}

export function useOwnModpacks(enabled: boolean): OwnModpacksState {
  const account = useAtomValue(accountAtom);
  const installed = useInstalledShareCodes();
  const [items, setItems] = useState<IModpack[]>([]);
  const [isLoading, setLoading] = useState(false);

  const token = account?.accessToken || "";

  useEffect(() => {
    if (!enabled || !token) return;

    let cancelled = false;
    setLoading(true);

    void api.backend
      .getOwnModpacks(token)
      .then((list) => {
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  return { items, isLoading, installed };
}

export interface KnownServer {
  name: string;
  ip: string;
  from: string;
}

export function useKnownServers(enabled: boolean): KnownServer[] {
  const versions = useAtomValue(versionsAtom);
  const [servers, setServers] = useState<KnownServer[]>([]);

  useEffect(() => {
    if (!enabled || versions.length === 0) return;

    let cancelled = false;

    void api.servers
      .versions(versions.map((version) => version.version))
      .then((list) => {
        if (cancelled) return;

        const seen = new Set<string>();
        const collected: KnownServer[] = [];

        for (const entry of list) {
          for (const server of entry.servers ?? []) {
            const ip = String(server?.ip ?? "").trim();
            if (!ip || seen.has(ip.toLowerCase())) continue;

            seen.add(ip.toLowerCase());
            collected.push({
              name: String(server?.name ?? ip),
              ip,
              from: entry.version,
            });
          }
        }

        setServers(collected);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [enabled, versions]);

  return servers;
}
