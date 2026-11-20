import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { BlockInfo } from "@/types/Schematic";
import { blockBaseId, readableBlockId } from "@/shared/blockState";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

type InfoMap = ReadonlyMap<string, BlockInfo>;

const EMPTY: InfoMap = new Map();
const stores = new Map<string, InfoMap>();
const requested = new Map<string, Set<string>>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function merge(key: string, entries: [string, BlockInfo][]) {
  stores.set(key, new Map([...(stores.get(key) ?? EMPTY), ...entries]));
  for (const listener of listeners) listener();
}

function requestedFor(key: string): Set<string> {
  let set = requested.get(key);
  if (!set) {
    set = new Set();
    requested.set(key, set);
  }
  return set;
}

export function fallbackInfo(id: string): BlockInfo {
  return { name: readableBlockId(blockBaseId(id)), icon: null };
}

export function useBlockInfo(versionPath: string, ids: readonly string[]) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const key = `${versionPath}\0${locale}`;
  const snapshot = useSyncExternalStore(
    subscribe,
    useCallback(() => stores.get(key) ?? EMPTY, [key]),
  );
  const wanted = useMemo(() => [...new Set(ids.map(blockBaseId))], [ids]);

  useEffect(() => {
    const asked = requestedFor(key);
    const missing = wanted.filter((id) => !asked.has(id));
    if (!missing.length) return;
    for (const id of missing) asked.add(id);
    void api.schematics
      .blocks(versionPath, missing, locale)
      .catch(ignoreFailure)
      .then((result) => {
        const found: [string, BlockInfo][] = [];
        for (const id of missing) {
          const info = result?.[id];
          if (info) found.push([id, info]);
          else asked.delete(id);
        }
        merge(key, found);
      });
  }, [key, locale, versionPath, wanted]);

  const get = useCallback(
    (id: string) => snapshot.get(blockBaseId(id)) ?? fallbackInfo(id),
    [snapshot],
  );
  return { get };
}
