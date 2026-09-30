import { Loader } from "@/types/Loader";
import {
  DependencyType,
  ILocalDependency,
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

function fileNamesOf(mod: ILocalProject): string[] {
  return (mod.version?.files ?? [])
    .map((file) =>
      String(file.filename ?? "")
        .replace(/\.disabled$/i, "")
        .toLowerCase(),
    )
    .filter(Boolean);
}

export function sharesFile(a: ILocalProject, b: ILocalProject): boolean {
  if (a.projectType !== b.projectType) return false;
  const names = new Set(fileNamesOf(a));
  return fileNamesOf(b).some((name) => names.has(name));
}

export function findTwin(
  mods: ILocalProject[],
  target: ILocalProject,
): ILocalProject | undefined {
  const key = `${target.provider}:${target.id}`;
  const title = normalizeProjectTitle(target.title);

  return mods.find(
    (mod) =>
      `${mod.provider}:${mod.id}` !== key &&
      mod.projectType === target.projectType &&
      ((!!title && normalizeProjectTitle(mod.title) === title) ||
        sharesFile(mod, target)),
  );
}

export function planDeletion(
  mods: ILocalProject[],
  target: ILocalProject | ILocalProject[],
  options: { includeDependents?: boolean; removeDependencies?: boolean } = {},
): DeletionPlan {
  const keyOf = (mod: ILocalProject) =>
    `${mod.projectType}:${mod.provider}:${mod.id}`;
  const byKey = new Map(mods.map((mod) => [keyOf(mod), mod]));
  const requested = (Array.isArray(target) ? target : [target])
    .map((mod) => byKey.get(keyOf(mod)))
    .filter((mod): mod is ILocalProject => Boolean(mod));
  if (requested.length === 0) return { remove: [], blockers: [] };
  const explicit = new Set(requested.map(keyOf));
  const dependencies = new Map<string, Set<string>>();
  const byTitle = new Map<string, ILocalProject[]>();
  const byFilename = new Map<string, Set<string>>();
  for (const mod of mods) {
    for (const filename of fileNamesOf(mod)) {
      const key = `${mod.projectType}:${filename}`;
      const matches = byFilename.get(key) ?? new Set<string>();
      matches.add(keyOf(mod));
      byFilename.set(key, matches);
    }
    const title = normalizeProjectTitle(mod.title);
    if (!title) continue;
    const key = `${mod.projectType}:${title}`;
    const matches = byTitle.get(key) ?? [];
    matches.push(mod);
    byTitle.set(key, matches);
  }

  const resolveDependency = (owner: ILocalProject, dep: ILocalDependency) => {
    if (dep.projectId) {
      const exact = byKey.get(
        `${owner.projectType}:${owner.provider}:${dep.projectId}`,
      );
      if (exact) return exact;
    }
    const title = normalizeProjectTitle(dep.title);
    if (!title) return undefined;
    const matches = (byTitle.get(`${owner.projectType}:${title}`) ?? []).filter(
      (mod) =>
        !dep.projectId ||
        mod.provider !== owner.provider ||
        mod.id === dep.projectId,
    );
    if (
      matches.length > 1 &&
      new Set(matches.map((mod) => mod.provider)).size === matches.length
    )
      return matches[0];
    return matches.length === 1 ? matches[0] : undefined;
  };

  const requiredBy = new Map<string, Set<string>>();
  for (const mod of mods) {
    const edges = new Set<string>();
    for (const dep of mod.version?.dependencies ?? []) {
      if (dep.relationType !== DependencyType.REQUIRED) continue;
      const resolved = resolveDependency(mod, dep);
      if (resolved) {
        const key = keyOf(resolved);
        edges.add(key);
        const users = requiredBy.get(key) ?? new Set<string>();
        users.add(keyOf(mod));
        requiredBy.set(key, users);
      }
    }
    dependencies.set(keyOf(mod), edges);
  }

  const replacements = new Map<string, Set<string>>();
  for (const mod of mods) {
    const keys = new Set(
      (
        byTitle.get(`${mod.projectType}:${normalizeProjectTitle(mod.title)}`) ??
        []
      )
        .filter((other) => other.provider !== mod.provider)
        .map(keyOf),
    );
    for (const filename of fileNamesOf(mod)) {
      for (const key of byFilename.get(`${mod.projectType}:${filename}`) ?? [])
        keys.add(key);
    }
    keys.delete(keyOf(mod));
    replacements.set(keyOf(mod), keys);
  }
  const hasReplacement = (key: string, removed: Set<string>) =>
    [...(replacements.get(key) ?? [])].some((other) => !removed.has(other));
  const losesDependency = (mod: ILocalProject, removed: Set<string>) =>
    [...(dependencies.get(keyOf(mod)) ?? [])].some(
      (key) => removed.has(key) && !hasReplacement(key, removed),
    );

  // Add the whole reverse chain before looking for orphaned libraries.
  // Planning all selected targets together makes bulk removal order independent.
  let changed = true;
  while (options.includeDependents && changed) {
    changed = false;
    for (const mod of mods) {
      if (!explicit.has(keyOf(mod)) && losesDependency(mod, explicit)) {
        explicit.add(keyOf(mod));
        changed = true;
      }
    }
  }

  const removeKeys = new Set(explicit);
  if (options.removeDependencies !== false) {
    // Reach the entire dependency component, then retain anything needed outside
    // it. This also handles cycles with three or more nodes and shared cycles.
    const queue = [...explicit];
    for (let index = 0; index < queue.length; index++) {
      const key = queue[index];
      if (hasReplacement(key, explicit)) continue;
      for (const dependency of dependencies.get(key) ?? []) {
        if (removeKeys.has(dependency)) continue;
        removeKeys.add(dependency);
        queue.push(dependency);
      }
    }
    changed = true;
    while (changed) {
      changed = false;
      for (const key of removeKeys) {
        if (explicit.has(key)) continue;
        const neededOutside = [...(requiredBy.get(key) ?? [])].some(
          (user) => !removeKeys.has(user),
        );
        if (neededOutside) {
          removeKeys.delete(key);
          changed = true;
        }
      }
    }
  }

  return {
    remove: mods.filter((mod) => removeKeys.has(keyOf(mod))),
    blockers: mods.filter(
      (mod) => !removeKeys.has(keyOf(mod)) && losesDependency(mod, removeKeys),
    ),
  };
}
