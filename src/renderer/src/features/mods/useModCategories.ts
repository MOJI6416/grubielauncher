import { useEffect, useMemo, useState } from "react";
import { Provider } from "@/types/ModManager";
import { ContentEntry } from "./entries";

const STORAGE_KEY = "grubie:modCategories";
const FRESH_FOR = 14 * 24 * 60 * 60 * 1000;
const KEEP_FOR = 90 * 24 * 60 * 60 * 1000;

export interface CachedCategories {
  categories: string[];
  at: number;
}

let memory: Map<string, CachedCategories> | null = null;
const inFlight = new Set<string>();

function readStore(): Map<string, CachedCategories> {
  if (memory) return memory;
  memory = new Map();

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    for (const [key, value] of Object.entries(raw ?? {})) {
      const item = value as Partial<CachedCategories> | null;
      if (!Array.isArray(item?.categories) || typeof item.at !== "number") {
        continue;
      }
      memory.set(key, {
        categories: item.categories.filter(
          (category): category is string => typeof category === "string",
        ),
        at: item.at,
      });
    }
  } catch {}

  return memory;
}

function writeStore(store: Map<string, CachedCategories>, now: number) {
  for (const [key, item] of store) {
    if (now - item.at > KEEP_FOR) store.delete(key);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(store)));
  } catch {}
}

export function categoryKeys(entries: ContentEntry[]): string[] {
  const keys = new Set<string>();

  for (const entry of entries) {
    if (!entry.id) continue;
    if (
      entry.provider !== Provider.MODRINTH &&
      entry.provider !== Provider.CURSEFORGE
    ) {
      continue;
    }
    keys.add(entry.key);
  }

  return [...keys];
}

export function staleKeys(
  keys: string[],
  store: ReadonlyMap<string, CachedCategories>,
  now: number,
): string[] {
  return keys.filter((key) => {
    const item = store.get(key);
    return !item || now - item.at > FRESH_FOR;
  });
}

export function splitKeys(keys: string[]): {
  modrinth: string[];
  curseforge: string[];
} {
  const modrinth: string[] = [];
  const curseforge: string[] = [];

  for (const key of keys) {
    const separator = key.indexOf(":");
    const provider = key.slice(0, separator);
    const id = key.slice(separator + 1);
    if (!id) continue;
    if (provider === Provider.MODRINTH) modrinth.push(id);
    else if (provider === Provider.CURSEFORGE) curseforge.push(id);
  }

  return { modrinth, curseforge };
}

export function useModCategories(
  entries: ContentEntry[],
  enabled: boolean,
): { categories: ReadonlyMap<string, string[]>; isLoading: boolean } {
  const [revision, setRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const keys = useMemo(() => categoryKeys(entries), [entries]);
  const signature = keys.join("|");

  useEffect(() => {
    if (!enabled) return;

    const store = readStore();
    const missing = staleKeys(keys, store, Date.now()).filter(
      (key) => !inFlight.has(key),
    );
    if (missing.length === 0) return;

    for (const key of missing) inFlight.add(key);
    setIsLoading(true);

    const { modrinth, curseforge } = splitKeys(missing);
    void window.api.modManager
      .projectCategories(modrinth, curseforge)
      .catch(() => ({}) as Record<string, string[]>)
      .then((result) => {
        const now = Date.now();
        for (const [key, categories] of Object.entries(result ?? {})) {
          if (Array.isArray(categories)) store.set(key, { categories, at: now });
        }
        for (const key of missing) inFlight.delete(key);
        writeStore(store, now);
        setIsLoading(false);
        setRevision((value) => value + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature]);

  const categories = useMemo(() => {
    const store = readStore();
    const map = new Map<string, string[]>();
    for (const key of keys) {
      const item = store.get(key);
      if (item) map.set(key, item.categories);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, revision]);

  return { categories, isLoading };
}
