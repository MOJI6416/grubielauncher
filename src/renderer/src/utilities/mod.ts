import { Loader } from "@/types/Loader";
import {
  DependencyType,
  ILocalProject,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { IServerConf, ServerCore } from "@/types/Server";

export function getProjectTypes(
  loader: Loader,
  server: IServerConf | undefined,
  provider: Provider,
): ProjectType[] {
  const projectTypes: ProjectType[] = [];

  if (loader == "vanilla") {
    projectTypes.push(ProjectType.RESOURCEPACK);

    if (provider != Provider.MODRINTH) projectTypes.push(ProjectType.WORLD);
    projectTypes.push(ProjectType.DATAPACK);

    if (server) {
      if (
        [
          ServerCore.BUKKIT,
          ServerCore.SPIGOT,
          ServerCore.PAPER,
          ServerCore.PURPUR,
        ].includes(server.core)
      ) {
        projectTypes.push(ProjectType.PLUGIN);
      }

      return projectTypes;
    }
  } else {
    projectTypes.push(ProjectType.MOD);
    projectTypes.push(ProjectType.RESOURCEPACK);
    projectTypes.push(ProjectType.SHADER);
    if (provider != Provider.MODRINTH) projectTypes.push(ProjectType.WORLD);
    projectTypes.push(ProjectType.DATAPACK);

    return projectTypes;
  }

  return projectTypes;
}

export function normalizeProjectTitle(title: string): string {
  return (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

export interface InstalledIndex {
  byProviderId: Map<string, ILocalProject>;
  byId: Map<string, ILocalProject>;
  byTitle: Map<string, ILocalProject>;
  bySha1: Map<string, ILocalProject>;
}

export function buildInstalledIndex(mods: ILocalProject[]): InstalledIndex {
  const byProviderId = new Map<string, ILocalProject>();
  const byId = new Map<string, ILocalProject>();
  const byTitle = new Map<string, ILocalProject>();
  const bySha1 = new Map<string, ILocalProject>();

  for (const mod of mods) {
    byProviderId.set(`${mod.provider}:${mod.id}`, mod);
    if (mod.id && !byId.has(mod.id)) byId.set(mod.id, mod);

    const title = normalizeProjectTitle(mod.title);
    if (title && !byTitle.has(title)) byTitle.set(title, mod);

    for (const file of mod.version?.files ?? []) {
      if (file.sha1 && !bySha1.has(file.sha1)) bySha1.set(file.sha1, mod);
    }
  }

  return { byProviderId, byId, byTitle, bySha1 };
}

export interface MatchableProject {
  id: string;
  title: string;
  provider?: Provider;
  version?: { files?: { sha1?: string }[] } | null;
}

export function findInstalledProject(
  index: InstalledIndex,
  item: MatchableProject,
): ILocalProject | undefined {
  if (item.provider) {
    const match = index.byProviderId.get(`${item.provider}:${item.id}`);
    if (match) return match;
  }

  if (item.id) {
    const match = index.byId.get(item.id);
    if (match) return match;
  }

  for (const file of item.version?.files ?? []) {
    if (file?.sha1) {
      const match = index.bySha1.get(file.sha1);
      if (match) return match;
    }
  }

  const title = normalizeProjectTitle(item.title);
  if (title) {
    const match = index.byTitle.get(title);
    if (match) return match;
  }

  return undefined;
}

export interface DeletionPlan {
  remove: ILocalProject[];
  blockers: ILocalProject[];
}

export function planDeletion(
  mods: ILocalProject[],
  target: ILocalProject,
): DeletionPlan {
  const keyOf = (mod: ILocalProject) => `${mod.provider}:${mod.id}`;
  const norm = (value: string) => normalizeProjectTitle(value);

  const byTitle = new Map<string, ILocalProject>();
  for (const mod of mods) {
    const key = norm(mod.title);
    if (key && !byTitle.has(key)) byTitle.set(key, mod);
  }

  const requiredBy = new Map<string, ILocalProject[]>();
  for (const mod of mods) {
    for (const dep of mod.version?.dependencies ?? []) {
      if (dep.relationType !== DependencyType.REQUIRED) continue;
      const key = norm(dep.title);
      if (!key) continue;
      const requirers = requiredBy.get(key) ?? [];
      requirers.push(mod);
      requiredBy.set(key, requirers);
    }
  }

  const removeKeys = new Set<string>([keyOf(target)]);
  const remove: ILocalProject[] = [target];

  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of [...remove]) {
      for (const dep of mod.version?.dependencies ?? []) {
        if (dep.relationType !== DependencyType.REQUIRED) continue;

        const depMod = byTitle.get(norm(dep.title));
        if (!depMod || removeKeys.has(keyOf(depMod))) continue;

        const requirers = requiredBy.get(norm(depMod.title)) ?? [];
        const neededOutside = requirers.some((r) => !removeKeys.has(keyOf(r)));
        if (neededOutside) continue;

        removeKeys.add(keyOf(depMod));
        remove.push(depMod);
        changed = true;
      }
    }
  }

  const blockerKeys = new Set<string>();
  const blockers: ILocalProject[] = [];
  for (const mod of remove) {
    const requirers = requiredBy.get(norm(mod.title)) ?? [];
    for (const requirer of requirers) {
      if (removeKeys.has(keyOf(requirer))) continue;
      if (blockerKeys.has(keyOf(requirer))) continue;
      blockerKeys.add(keyOf(requirer));
      blockers.push(requirer);
    }
  }

  return { remove, blockers };
}
