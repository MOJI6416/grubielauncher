import {
  DependencyType,
  ILocalProject,
  LocalModDependencyIndex,
  ProjectType,
} from "@/types/ModManager";
import {
  buildDependencyGraph,
  modGraphKey,
  planDeletion,
} from "@renderer/utilities/mod";
import { entryKey } from "./entries";

export interface DeclaredRelation {
  title: string;
  mod?: ILocalProject;
}

export interface ModRelations {
  requires: ILocalProject[];
  requiredBy: ILocalProject[];
  optional: DeclaredRelation[];
  embedded: string[];
  conflicts: DeclaredRelation[];
}

function keyOfEntry(mod: ILocalProject): string {
  return entryKey(mod.provider, mod.id);
}

function fileKeys(mod: ILocalProject): string[] {
  return (mod.version?.files ?? [])
    .map((file) =>
      String(file.filename ?? "")
        .replace(/\.disabled$/i, "")
        .toLowerCase(),
    )
    .filter(Boolean);
}

export function modRelations(
  mods: ILocalProject[],
  target: ILocalProject,
  localDependencies?: LocalModDependencyIndex,
): ModRelations {
  const graph = buildDependencyGraph(mods, localDependencies);
  const key = modGraphKey(target);
  const own = graph.byKey.get(key) ?? target;
  const lookup = (keys: Iterable<string>) =>
    [...keys]
      .map((item) => graph.byKey.get(item))
      .filter((mod): mod is ILocalProject => !!mod && modGraphKey(mod) !== key);

  const optional: DeclaredRelation[] = [];
  const conflicts: DeclaredRelation[] = [];
  const embedded = new Set<string>();

  for (const dep of own.version?.dependencies ?? []) {
    const mod = graph.resolveDependency(own, dep);
    if (dep.relationType === DependencyType.OPTIONAL) {
      optional.push({ title: mod?.title ?? dep.title, mod });
    } else if (dep.relationType === DependencyType.INCOMPATIBLE) {
      conflicts.push({ title: mod?.title ?? dep.title, mod });
    } else if (dep.relationType === DependencyType.EMBEDDED) {
      if (dep.title) embedded.add(dep.title);
    }
  }

  for (const other of mods) {
    if (modGraphKey(other) === key) continue;
    for (const dep of other.version?.dependencies ?? []) {
      if (dep.relationType !== DependencyType.INCOMPATIBLE) continue;
      const resolved = graph.resolveDependency(other, dep);
      if (resolved && modGraphKey(resolved) === key) {
        if (!conflicts.some((item) => item.mod === other)) {
          conflicts.push({ title: other.title, mod: other });
        }
      }
    }
  }

  if (own.projectType === ProjectType.MOD) {
    for (const file of fileKeys(own)) {
      for (const id of localDependencies?.[file]?.embedded ?? []) {
        embedded.add(id);
      }
    }
  }

  return {
    requires: lookup(graph.dependencies.get(key) ?? []),
    requiredBy: lookup(graph.requiredBy.get(key) ?? []),
    optional,
    embedded: [...embedded].sort((a, b) => a.localeCompare(b)),
    conflicts,
  };
}

export interface TogglePlan {
  toggle: ILocalProject[];
  dependents: ILocalProject[];
}

export function planDisable(
  mods: ILocalProject[],
  targets: ILocalProject[],
  disabledKeys: ReadonlySet<string>,
  localDependencies?: LocalModDependencyIndex,
): TogglePlan {
  const enabled = mods.filter((mod) => !disabledKeys.has(keyOfEntry(mod)));
  const wanted = targets.filter((mod) => !disabledKeys.has(keyOfEntry(mod)));
  if (wanted.length === 0) return { toggle: [], dependents: [] };

  const probe = planDeletion(enabled, wanted, { localDependencies });
  if (probe.blockers.length > 0) {
    return { toggle: wanted, dependents: probe.blockers };
  }
  return { toggle: probe.remove, dependents: [] };
}

export function planEnable(
  mods: ILocalProject[],
  targets: ILocalProject[],
  disabledKeys: ReadonlySet<string>,
  localDependencies?: LocalModDependencyIndex,
): ILocalProject[] {
  const graph = buildDependencyGraph(mods, localDependencies);
  const result = new Map<string, ILocalProject>();
  const queue = targets
    .map((mod) => graph.byKey.get(modGraphKey(mod)))
    .filter((mod): mod is ILocalProject => !!mod);

  for (const mod of queue) result.set(modGraphKey(mod), mod);

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const dependency of graph.dependencies.get(modGraphKey(current)) ??
      []) {
      if (result.has(dependency)) continue;
      const mod = graph.byKey.get(dependency);
      if (!mod || !disabledKeys.has(keyOfEntry(mod))) continue;
      result.set(dependency, mod);
      queue.push(mod);
    }
  }

  return [...result.values()];
}
