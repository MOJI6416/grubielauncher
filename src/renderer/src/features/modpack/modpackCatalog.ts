import { atom, getDefaultStore } from "jotai";
import type { Loader } from "@/types/Loader";
import {
  ProjectType,
  type IProject,
  type IVersion as IProjectVersion,
} from "@/types/ModManager";
import type { IModpackSource } from "@/types/ModpackSource";

const api = window.api;

const CATALOG_TTL_MS = 10 * 60 * 1000;

export interface ModpackCatalog {
  project: IProject | null;
  versions: IProjectVersion[];
  failed: boolean;
}

const cache = new Map<string, { at: number; task: Promise<ModpackCatalog> }>();

function catalogKey(source: IModpackSource, loader: Loader): string {
  return `${source.provider}:${source.projectId}:${loader}`;
}

async function fetchCatalog(
  source: IModpackSource,
  loader: Loader,
): Promise<ModpackCatalog> {
  const [project, versions] = await Promise.all([
    api.modManager
      .getProject(source.provider, source.projectId)
      .catch(() => null),
    api.modManager
      .getVersions(source.provider, source.projectId, {
        projectType: ProjectType.MODPACK,
        loader,
        modUrl: source.url,
      })
      .catch(() => [] as IProjectVersion[]),
  ]);

  return { project, versions, failed: !project && versions.length === 0 };
}

export function loadModpackCatalog(
  source: IModpackSource,
  loader: Loader,
  force = false,
): Promise<ModpackCatalog> {
  const key = catalogKey(source, loader);
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.at < CATALOG_TTL_MS) {
    return cached.task;
  }

  const task = fetchCatalog(source, loader).then((catalog) => {
    if (catalog.failed && cache.get(key)?.task === task) cache.delete(key);
    return catalog;
  });
  cache.set(key, { at: Date.now(), task });

  return task;
}

export const modpackUpdatesAtom = atom<Record<string, string>>({});

export function recordModpackUpdate(key: string, label: string | null): void {
  const store = getDefaultStore();
  const current = store.get(modpackUpdatesAtom);

  if (label === null) {
    if (!(key in current)) return;
    const next = { ...current };
    delete next[key];
    store.set(modpackUpdatesAtom, next);
    return;
  }

  if (current[key] === label) return;
  store.set(modpackUpdatesAtom, { ...current, [key]: label });
}
