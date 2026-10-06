import type { ILocalProject } from "@/types/ModManager";
import type { ModpackDiff, ModpackDiffEntry } from "./modpackDiff";
import type {
  ModpackBase,
  ModpackBaseProject,
  ModpackFileMap,
  ModpackFileSide,
  ModpackFileTarget,
  ModpackFilesPlan,
} from "@/types/ModpackSource";

export const MODPACK_CONTENT_FOLDERS = [
  "mods",
  "resourcepacks",
  "shaderpacks",
  "datapacks",
];

const PROTECTED_FILES = new Set([
  "options.txt",
  "optionsof.txt",
  "optionsshaders.txt",
  "servers.dat",
]);

const PROTECTED_FOLDERS = ["saves/"];

export function normalizePackPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function isContentPath(value: string): boolean {
  const top = normalizePackPath(value).split("/")[0]?.toLowerCase() ?? "";
  return MODPACK_CONTENT_FOLDERS.includes(top);
}

export function isProtectedPath(value: string): boolean {
  const normalized = normalizePackPath(value).toLowerCase();
  if (PROTECTED_FILES.has(normalized)) return true;
  return PROTECTED_FOLDERS.some((folder) => normalized.startsWith(folder));
}

export function modpackProjectKey(
  project: Pick<ILocalProject, "provider" | "id">,
): string {
  return `${project.provider}:${project.id}`;
}

function enabledName(name: string): string {
  return name.replace(/\.disabled$/i, "");
}

function fileNames(project: ILocalProject): string[] {
  return (project.version?.files ?? [])
    .map((file) => enabledName(file.filename ?? ""))
    .filter(Boolean);
}

export function packLocalContentPaths(
  mods: ILocalProject[],
  packRoot: string,
): string[] {
  const root = normalizePackPath(packRoot).replace(/\/+$/, "");
  const prefixes = [`${root}/overrides/`, `${root}/client-overrides/`];
  const result = new Set<string>();

  for (const mod of mods) {
    for (const file of mod.version?.files ?? []) {
      if (!file.localPath) continue;

      const local = normalizePackPath(file.localPath);
      const prefix = prefixes.find((item) => local.startsWith(item));
      if (!prefix) continue;

      const relative = local.slice(prefix.length);
      if (!relative || !isContentPath(relative)) continue;

      result.add(relative);
      result.add(`${relative}.disabled`);
    }
  }

  return [...result].sort();
}

export function baseProjectsOf(mods: ILocalProject[]): ModpackBaseProject[] {
  return mods.map((mod) => ({
    key: modpackProjectKey(mod),
    versionId: mod.version?.id ?? "",
    files: fileNames(mod),
  }));
}

function fileHashes(project: ILocalProject): string[] {
  return (project.version?.files ?? [])
    .map((file) => (file.sha1 ?? "").toLowerCase())
    .filter(Boolean)
    .sort();
}

function sameContent(a: ILocalProject, b: ILocalProject): boolean {
  const leftHashes = fileHashes(a);
  const rightHashes = fileHashes(b);
  if (leftHashes.length > 0 && rightHashes.length > 0) {
    return leftHashes.join("\n") === rightHashes.join("\n");
  }

  if (
    modpackProjectKey(a) === modpackProjectKey(b) &&
    (a.version?.id ?? "") === (b.version?.id ?? "")
  ) {
    return true;
  }

  const left = fileNames(a).sort();
  const right = fileNames(b).sort();
  return left.length > 0 && left.join("\n") === right.join("\n");
}

function isDisabled(project: ILocalProject): boolean {
  const files = project.version?.files ?? [];
  return files.length > 0 && files.every((file) => file.disabled === true);
}

function keepDisabledState(
  next: ILocalProject,
  current: ILocalProject,
): ILocalProject {
  if (!isDisabled(current) || !next.version) return next;

  return {
    ...next,
    version: {
      ...next.version,
      files: next.version.files.map((file) => ({ ...file, disabled: true })),
    },
  };
}

export interface ModpackModUpdate {
  from: ILocalProject;
  to: ILocalProject;
  replacedUserVersion: boolean;
}

export interface ModpackMergeResult {
  mods: ILocalProject[];
  added: ILocalProject[];
  removed: ILocalProject[];
  updated: ModpackModUpdate[];
  keptPinned: ILocalProject[];
  removedByUser: ILocalProject[];
  own: ILocalProject[];
  unchanged: number;
}

export function mergeModpackMods(input: {
  base: ModpackBaseProject[];
  current: ILocalProject[];
  next: ILocalProject[];
  restoreRemoved?: boolean;
}): ModpackMergeResult {
  const baseByKey = new Map(input.base.map((item) => [item.key, item]));
  const nextByKey = new Map<string, ILocalProject>();
  for (const project of input.next) {
    const key = modpackProjectKey(project);
    if (!nextByKey.has(key)) nextByKey.set(key, project);
  }

  const baseByFile = new Map<string, string>();
  for (const item of input.base) {
    for (const name of item.files) {
      if (!baseByFile.has(name)) baseByFile.set(name, item.key);
    }
  }

  const nextByFile = new Map<string, string>();
  for (const [key, project] of nextByKey) {
    for (const name of fileNames(project)) {
      if (!nextByFile.has(name)) nextByFile.set(name, key);
    }
  }

  const packKeyOf = (project: ILocalProject): string | null => {
    const key = modpackProjectKey(project);
    if (baseByKey.has(key) || nextByKey.has(key)) return key;

    for (const name of fileNames(project)) {
      const fromBase = baseByFile.get(name);
      if (fromBase) return fromBase;
      const fromNext = nextByFile.get(name);
      if (fromNext) return fromNext;
    }

    return null;
  };

  const result: ModpackMergeResult = {
    mods: [],
    added: [],
    removed: [],
    updated: [],
    keptPinned: [],
    removedByUser: [],
    own: [],
    unchanged: 0,
  };
  const claimed = new Set<string>();

  for (const current of input.current) {
    const packKey = packKeyOf(current);

    if (!packKey || claimed.has(packKey)) {
      result.own.push(current);
      result.mods.push(current);
      continue;
    }

    claimed.add(packKey);
    const next = nextByKey.get(packKey);
    const base = baseByKey.get(packKey);

    if (!next) {
      if (!base) {
        result.own.push(current);
        result.mods.push(current);
      } else if (current.pinned) {
        result.keptPinned.push(current);
        result.mods.push(current);
      } else {
        result.removed.push(current);
      }
      continue;
    }

    if (sameContent(current, next)) {
      result.unchanged += 1;
      result.mods.push(current);
      continue;
    }

    if (current.pinned) {
      result.keptPinned.push(current);
      result.mods.push(current);
      continue;
    }

    const merged = keepDisabledState(next, current);
    result.mods.push(merged);
    result.updated.push({
      from: current,
      to: merged,
      replacedUserVersion:
        !!base &&
        (current.version?.id ?? "") !== base.versionId &&
        modpackProjectKey(current) === base.key,
    });
  }

  for (const [key, next] of nextByKey) {
    if (claimed.has(key)) continue;

    if (baseByKey.has(key) && !input.restoreRemoved) {
      result.removedByUser.push(next);
      continue;
    }

    result.mods.push(next);
    result.added.push(next);
  }

  return result;
}

function fileLabel(project: ILocalProject): string {
  return project.version?.files?.[0]?.filename || project.version?.id || "";
}

function shortHash(project: ILocalProject): string {
  return (project.version?.files?.[0]?.sha1 ?? "").slice(0, 7);
}

function diffEntry(
  project: ILocalProject,
  extra: Partial<ModpackDiffEntry>,
): ModpackDiffEntry {
  return {
    key: modpackProjectKey(project),
    title: project.title,
    projectType: project.projectType,
    ...extra,
  };
}

function byTitle(a: ModpackDiffEntry, b: ModpackDiffEntry): number {
  return a.title.localeCompare(b.title);
}

export function modpackMergeDiff(merge: ModpackMergeResult): ModpackDiff {
  const updated = merge.updated.map(({ from, to }) => {
    let fromVersion = fileLabel(from);
    let toVersion = fileLabel(to);
    if (fromVersion === toVersion) {
      fromVersion = `${fromVersion} · ${shortHash(from)}`;
      toVersion = `${toVersion} · ${shortHash(to)}`;
    }
    return diffEntry(to, { fromVersion, toVersion });
  });

  return {
    added: merge.added
      .map((project) => diffEntry(project, { toVersion: fileLabel(project) }))
      .sort(byTitle),
    removed: merge.removed
      .map((project) => diffEntry(project, { fromVersion: fileLabel(project) }))
      .sort(byTitle),
    updated: updated.sort(byTitle),
    unchanged: merge.mods.length - merge.added.length - merge.updated.length,
  };
}

export function planModpackFiles(input: {
  base: Pick<ModpackBase, "client" | "server">;
  next: Record<ModpackFileSide, ModpackFileMap>;
  current: Record<ModpackFileSide, Record<string, string | null>>;
}): ModpackFilesPlan {
  const plan: ModpackFilesPlan = {
    write: [],
    conflicts: [],
    remove: [],
    kept: [],
    protected: [],
  };

  for (const side of ["client", "server"] as const) {
    const base = input.base[side] ?? {};
    const next = input.next[side] ?? {};
    const current = input.current[side] ?? {};
    const paths = new Set([...Object.keys(base), ...Object.keys(next)]);

    for (const path of [...paths].sort()) {
      const target: ModpackFileTarget = { side, path };
      const before = base[path];
      const after = next[path];
      const ours = current[path] ?? null;
      const guarded = side === "client" && isProtectedPath(path);

      if (after !== undefined) {
        if (ours === after) continue;

        if (ours === null) {
          if (before === after) continue;
          plan.write.push(target);
          continue;
        }

        if (guarded) {
          plan.protected.push(target);
          continue;
        }

        if (before === after) continue;

        plan.write.push(target);
        if (ours !== before) plan.conflicts.push(target);
        continue;
      }

      if (ours === null) continue;

      if (guarded) {
        plan.protected.push(target);
        continue;
      }

      if (ours === before) plan.remove.push(target);
      else plan.kept.push(target);
    }
  }

  return plan;
}
