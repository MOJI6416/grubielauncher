import { useEffect } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import type { ILocalProject } from "@/types/ModManager";
import { pathsAtom } from "@renderer/stores/atoms";
import {
  type IModSet,
  parseSetsFile,
  removeSet,
  saveIntoSets,
  toSetItems,
} from "./modSets";

const api = window.api;

const FILE_NAME = "mod-sets.json";

export const modSetsAtom = atom<IModSet[] | null>(null);

let loading: Promise<IModSet[]> | null = null;

function setsPath(): string {
  return api.path.join(getDefaultStore().get(pathsAtom).launcher, FILE_NAME);
}

export function loadModSets(): Promise<IModSet[]> {
  const store = getDefaultStore();
  const loaded = store.get(modSetsAtom);
  if (loaded) return Promise.resolve(loaded);

  loading ??= (async () => {
    const target = setsPath();
    const raw = (await api.fs.pathExists(target))
      ? await api.fs.readJSON(target).catch(() => null)
      : null;
    const sets = parseSetsFile(raw);
    store.set(modSetsAtom, sets);
    return sets;
  })().finally(() => {
    loading = null;
  });

  return loading;
}

async function persist(sets: IModSet[]): Promise<boolean> {
  const saved = await api.fs
    .writeJSON(setsPath(), { version: 1, sets })
    .catch(() => false);
  if (saved) getDefaultStore().set(modSetsAtom, sets);
  return saved;
}

export async function saveModSet(
  name: string,
  mods: ILocalProject[],
): Promise<IModSet | null> {
  const { sets, set } = saveIntoSets(
    await loadModSets(),
    name,
    toSetItems(mods),
    new Date().toISOString(),
    crypto.randomUUID(),
  );
  return (await persist(sets)) ? set : null;
}

export async function deleteModSet(id: string): Promise<boolean> {
  return await persist(removeSet(await loadModSets(), id));
}

export function useModSets(): IModSet[] | null {
  const sets = useAtomValue(modSetsAtom);

  useEffect(() => {
    if (!sets) void loadModSets();
  }, [sets]);

  return sets;
}
