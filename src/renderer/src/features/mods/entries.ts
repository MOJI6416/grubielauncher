import {
  ILocalFile,
  ILocalProject,
  IProject,
  IProjectStats,
  ProjectType,
  Provider,
} from "@/types/ModManager";

export type ModSide = "client" | "server" | "both";

export interface ContentEntry {
  key: string;
  id: string;
  provider: Provider;
  projectType: ProjectType;
  title: string;
  description: string;
  iconUrl: string | null;
  url: string;
  stats?: IProjectStats;
  installed: ILocalProject | null;
  project: IProject | null;
  pendingRemoved: boolean;
  side: ModSide;
  size: number;
  fileName: string;
  markedDisabled: boolean;
}

export function entryKey(provider: Provider, id: string): string {
  return `${provider}:${id}`;
}

export function getModSide(files: ILocalFile[] | undefined): ModSide {
  if (!files || files.length === 0) return "both";

  const client = files.some((file) => file.isClient !== false);
  const server = files.some((file) => file.isServer);

  if (client && !server) return "client";
  if (!client && server) return "server";

  return "both";
}

export function totalSize(files: ILocalFile[] | undefined): number {
  if (!files) return 0;
  return files.reduce(
    (sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0),
    0,
  );
}

export function isMarkedDisabled(mod: Pick<ILocalProject, "version">): boolean {
  return mod.version?.files.some((file) => file.disabled === true) === true;
}

export function applyDisabledState(
  files: ILocalFile[],
  disabled: boolean,
): ILocalFile[] {
  if (!disabled) return files;
  return files.map((file) => ({ ...file, disabled: true }));
}

export function canToggleType(projectType: ProjectType): boolean {
  return (
    projectType !== ProjectType.WORLD && projectType !== ProjectType.DATAPACK
  );
}

export function fromLocalProject(
  mod: ILocalProject,
  pendingRemoved = false,
): ContentEntry {
  const files = mod.version?.files ?? [];

  return {
    key: entryKey(mod.provider, mod.id),
    id: mod.id,
    provider: mod.provider,
    projectType: mod.projectType,
    title: mod.title,
    description: mod.description,
    iconUrl: mod.iconUrl,
    url: mod.url,
    installed: mod,
    project: null,
    pendingRemoved,
    side: getModSide(files),
    size: totalSize(files),
    fileName: files[0]?.filename ?? "",
    markedDisabled: isMarkedDisabled(mod),
  };
}

export function fromCatalogProject(
  project: IProject,
  installed: ILocalProject | null,
): ContentEntry {
  const files = installed?.version?.files ?? [];

  return {
    key: entryKey(project.provider, project.id),
    id: project.id,
    provider: project.provider,
    projectType: project.projectType,
    title: project.title,
    description: project.description,
    iconUrl: project.iconUrl,
    url: project.url,
    stats: project.stats,
    installed,
    project,
    pendingRemoved: false,
    side: getModSide(files),
    size: totalSize(files),
    fileName: files[0]?.filename ?? "",
    markedDisabled: installed ? isMarkedDisabled(installed) : false,
  };
}

export function withInstalled(
  entry: ContentEntry,
  installed: ILocalProject | null,
  pendingRemoved = false,
): ContentEntry {
  if (entry.installed === installed && entry.pendingRemoved === pendingRemoved) {
    return entry;
  }

  const files = installed?.version?.files ?? [];

  return {
    ...entry,
    installed,
    pendingRemoved,
    side: getModSide(files),
    size: totalSize(files),
    fileName: files[0]?.filename ?? entry.fileName,
    markedDisabled: installed ? isMarkedDisabled(installed) : false,
  };
}

export function buildLibraryEntries(
  mods: ILocalProject[],
  pendingRemoved: ILocalProject[],
  projectType: ProjectType,
): ContentEntry[] {
  const entries: ContentEntry[] = [];
  const seen = new Set<string>();

  for (const mod of mods) {
    if (mod.projectType !== projectType) continue;
    const key = entryKey(mod.provider, mod.id);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(fromLocalProject(mod));
  }

  for (const mod of pendingRemoved) {
    if (mod.projectType !== projectType) continue;
    const key = entryKey(mod.provider, mod.id);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(fromLocalProject(mod, true));
  }

  return entries;
}

export function mergeCatalogPages(
  previous: IProject[],
  next: IProject[],
): IProject[] {
  const seen = new Set(previous.map((item) => entryKey(item.provider, item.id)));
  const merged = [...previous];

  for (const item of next) {
    const key = entryKey(item.provider, item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

export function hasMorePages(
  loaded: number,
  total: number | undefined,
): boolean {
  if (!total || total <= 0) return false;
  return loaded > 0 && loaded < total;
}

export function isSameLocalProject(
  a: Pick<ILocalProject, "id" | "title">,
  b: Pick<ILocalProject, "id" | "title">,
): boolean {
  return a.id === b.id || a.title.toLowerCase() === b.title.toLowerCase();
}
