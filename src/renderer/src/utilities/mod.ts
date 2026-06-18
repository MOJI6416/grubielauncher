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

/**
 * Normalizes a project title so the same mod published under slightly different
 * names (across providers, with loader suffixes, punctuation, etc.) collapses to
 * the same key. Examples that should all map to "justenoughitems":
 *   "Just Enough Items", "Just Enough Items (JEI)", "Just Enough Items [Fabric]".
 */
export function normalizeProjectTitle(title: string): string {
  return (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\([^)]*\)/g, " ") // drop "(...)" segments e.g. "(JEI)"
    .replace(/\[[^\]]*\]/g, " ") // drop "[...]" segments e.g. "[Forge]"
    .replace(/[^a-z0-9]+/g, ""); // keep only alphanumerics (also strips diacritics)
}

export interface InstalledIndex {
  byProviderId: Map<string, ILocalProject>;
  byId: Map<string, ILocalProject>;
  byTitle: Map<string, ILocalProject>;
  bySha1: Map<string, ILocalProject>;
}

/**
 * Pre-computes lookup maps for the installed mods so matching a search result
 * against the installed list is O(1) per candidate instead of O(installed).
 */
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

/**
 * Finds the already-installed project that matches a search result. Matching is
 * attempted, strongest first, by: provider+id, id (cross-provider safety net),
 * any shared file sha1, and finally the normalized title.
 */
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
  // Every mod that will be removed, including the target and the required
  // dependencies that become orphaned by removing it.
  remove: ILocalProject[];
  // Mods that are kept but still require something in `remove` — these block the
  // deletion. While this is non-empty the deletion must not proceed.
  blockers: ILocalProject[];
}

/**
 * Plans the deletion of a mod, taking the required-dependency graph into account.
 *
 * Removing a mod also removes its required dependencies that nothing else needs
 * anymore (orphan cleanup). Dependency edges are matched by normalized title, so
 * naming differences between providers do not break the graph.
 *
 * Because mutually-dependent mods (A requires B, B requires A) are pulled into the
 * removal set together, deleting either one is possible — this avoids the deadlock
 * where two mods each list the other as a required dependency and neither could be
 * removed.
 *
 * The deletion is only safe when `blockers` is empty: a non-empty `blockers` means
 * a mod the user is keeping still requires one of the mods scheduled for removal.
 */
export function planDeletion(
  mods: ILocalProject[],
  target: ILocalProject,
): DeletionPlan {
  const keyOf = (mod: ILocalProject) => `${mod.provider}:${mod.id}`;
  const norm = (value: string) => normalizeProjectTitle(value);

  // normalized title -> installed mod (first wins)
  const byTitle = new Map<string, ILocalProject>();
  for (const mod of mods) {
    const key = norm(mod.title);
    if (key && !byTitle.has(key)) byTitle.set(key, mod);
  }

  // normalized title -> mods that list it as a REQUIRED dependency
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

  // Grow the removal set downwards with required dependencies that are not needed
  // by anything outside the set. Iterates to a fixpoint, cycle-safe via removeKeys.
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
