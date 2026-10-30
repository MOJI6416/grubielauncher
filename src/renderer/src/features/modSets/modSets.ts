import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import { entryKey } from "@renderer/features/mods/entries";
import { isCheckableProject } from "@renderer/features/mods/updates";

export interface IModSetItem {
  provider: Provider.CURSEFORGE | Provider.MODRINTH;
  id: string;
  projectType: ProjectType;
  title: string;
  iconUrl: string | null;
  url: string;
}

export interface IModSet {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: IModSetItem[];
}

const SET_TYPES = new Set<ProjectType>([
  ProjectType.MOD,
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
]);

const NAME_LIMIT = 64;

export function normalizeSetName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, NAME_LIMIT);
}

function sameName(a: string, b: string): boolean {
  return normalizeSetName(a).toLowerCase() === normalizeSetName(b).toLowerCase();
}

export function findSetByName(
  sets: IModSet[],
  name: string,
): IModSet | undefined {
  return sets.find((set) => sameName(set.name, name));
}

export function toSetItems(mods: ILocalProject[]): IModSetItem[] {
  const items: IModSetItem[] = [];
  const seen = new Set<string>();

  for (const mod of mods) {
    if (!isCheckableProject(mod) || !SET_TYPES.has(mod.projectType)) continue;

    const key = entryKey(mod.provider, mod.id);
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      provider: mod.provider as IModSetItem["provider"],
      id: mod.id,
      projectType: mod.projectType,
      title: mod.title || mod.id,
      iconUrl: mod.iconUrl ?? null,
      url: mod.url ?? "",
    });
  }

  return items;
}

export function saveIntoSets(
  sets: IModSet[],
  name: string,
  items: IModSetItem[],
  now: string,
  newId: string,
): { sets: IModSet[]; set: IModSet } {
  const existing = findSetByName(sets, name);

  if (existing) {
    const known = new Set(
      existing.items.map((item) => entryKey(item.provider, item.id)),
    );
    const set: IModSet = {
      ...existing,
      updatedAt: now,
      items: [
        ...existing.items,
        ...items.filter((item) => !known.has(entryKey(item.provider, item.id))),
      ],
    };
    return {
      sets: sets.map((item) => (item.id === existing.id ? set : item)),
      set,
    };
  }

  const set: IModSet = {
    id: newId,
    name: normalizeSetName(name),
    createdAt: now,
    updatedAt: now,
    items,
  };
  return { sets: [...sets, set], set };
}

export function removeSet(sets: IModSet[], id: string): IModSet[] {
  return sets.filter((set) => set.id !== id);
}

export function setAsProjects(set: IModSet): ILocalProject[] {
  return set.items.map((item) => ({
    title: item.title,
    description: "",
    projectType: item.projectType,
    iconUrl: item.iconUrl,
    url: item.url,
    provider: item.provider,
    id: item.id,
    version: null,
  }));
}

function readItem(raw: unknown): IModSetItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  if (item.provider !== Provider.CURSEFORGE && item.provider !== Provider.MODRINTH) {
    return null;
  }
  if (typeof item.id !== "string" || !item.id) return null;
  if (!SET_TYPES.has(item.projectType as ProjectType)) return null;

  return {
    provider: item.provider,
    id: item.id,
    projectType: item.projectType as ProjectType,
    title: typeof item.title === "string" && item.title ? item.title : item.id,
    iconUrl: typeof item.iconUrl === "string" ? item.iconUrl : null,
    url: typeof item.url === "string" ? item.url : "",
  };
}

export function parseSetsFile(raw: unknown): IModSet[] {
  const list = (raw as { sets?: unknown } | null)?.sets;
  if (!Array.isArray(list)) return [];

  const sets: IModSet[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const set = entry as Record<string, unknown>;
    if (typeof set.id !== "string" || typeof set.name !== "string") continue;

    sets.push({
      id: set.id,
      name: normalizeSetName(set.name) || set.id,
      createdAt: typeof set.createdAt === "string" ? set.createdAt : "",
      updatedAt: typeof set.updatedAt === "string" ? set.updatedAt : "",
      items: Array.isArray(set.items)
        ? set.items.map(readItem).filter((item): item is IModSetItem => !!item)
        : [],
    });
  }

  return sets;
}
