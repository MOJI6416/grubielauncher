import type { Loader } from "@/types/Loader";
import type { LoaderVersion } from "@/types/VersionsService";
import {
  compareLoaderVersions,
  isStableLoaderVersion,
} from "@/shared/loaderCompat";
import {
  DependencyType,
  ILocalProject,
  IVersion as ModVersion,
  ProjectType,
} from "@/types/ModManager";
import { isLibraryOnly } from "@/shared/modCategories";
import {
  applyDisabledState,
  entryKey,
  isMarkedDisabled,
  localTitle,
} from "@renderer/features/mods/entries";
import {
  isCheckableProject,
  toLocalProject,
  type UpdateState,
} from "@renderer/features/mods/updates";

export type PortStatus =
  | "updated"
  | "added"
  | "installed"
  | "kept"
  | "library"
  | "missing"
  | "unchecked"
  | "localMod";

export interface PortItem {
  key: string;
  title: string;
  projectType: ProjectType;
  status: PortStatus;
  viaLoader?: Loader;
  project?: ILocalProject;
  latest?: ModVersion;
}

export interface PortPlanInput {
  mods: ILocalProject[];
  primary: ReadonlyMap<string, UpdateState>;
  fallback?: ReadonlyMap<string, UpdateState>;
  fallbackLoader?: Loader;
  disabled: ReadonlySet<string>;
  categories: ReadonlyMap<string, string[]>;
  localPaths: ReadonlyMap<string, string>;
  includeWorlds: boolean;
}

export function localPathKey(key: string, filename: string): string {
  return `${key}|${filename}`;
}

export function pickLoaderVersion(
  versions: LoaderVersion[],
  loader: Loader,
): LoaderVersion | undefined {
  if (loader === "fabric" || loader === "quilt") {
    const stable = versions
      .filter((version) => isStableLoaderVersion(version.id, loader))
      .sort((a, b) => compareLoaderVersions(b.id, a.id));
    if (stable[0]) return stable[0];
  }

  return versions[0];
}

export function fallbackLoaderFor(
  loader: Loader,
  minecraftVersion: string,
): Loader | undefined {
  if (loader === "quilt") return "fabric";
  if (loader === "neoforge" && minecraftVersion === "1.20.1") return "forge";
  return undefined;
}

function found(state: UpdateState | undefined): ModVersion | null {
  if (!state || !state.latest) return null;
  return state.status === "update" || state.status === "current"
    ? state.latest
    : null;
}

function keepAsIs(
  mod: ILocalProject,
  key: string,
  disabled: boolean,
  localPaths: ReadonlyMap<string, string>,
): ILocalProject | null {
  const files = mod.version?.files ?? [];
  if (files.length === 0) return null;

  const kept = files.map((file) => ({
    ...file,
    localPath: localPaths.get(localPathKey(key, file.filename)),
  }));
  if (kept.some((file) => !file.localPath && !file.url)) return null;

  return {
    ...mod,
    version: {
      id: mod.version?.id ?? "",
      dependencies: mod.version?.dependencies ?? [],
      files: applyDisabledState(kept, disabled),
    },
  };
}

export function planPort(input: PortPlanInput): PortItem[] {
  const items: PortItem[] = [];

  for (const mod of input.mods) {
    if (mod.projectType === ProjectType.PLUGIN) continue;
    if (mod.projectType === ProjectType.WORLD && !input.includeWorlds) continue;

    const key = entryKey(mod.provider, mod.id);
    const base = { key, title: localTitle(mod), projectType: mod.projectType };
    const disabled = input.disabled.has(key) || isMarkedDisabled(mod);
    const isMod = mod.projectType === ProjectType.MOD;

    const keep = (): PortItem => {
      const project = keepAsIs(mod, key, disabled, input.localPaths);
      return project
        ? { ...base, status: "kept", project }
        : { ...base, status: "missing" };
    };

    if (mod.projectType === ProjectType.WORLD || !isCheckableProject(mod)) {
      items.push(isMod ? { ...base, status: "localMod" } : keep());
      continue;
    }

    const state = input.primary.get(key);
    let latest = found(state);
    let viaLoader: Loader | undefined;

    if (!latest && isMod && input.fallbackLoader) {
      latest = found(input.fallback?.get(key));
      if (latest) viaLoader = input.fallbackLoader;
    }

    if (latest) {
      items.push({
        ...base,
        status: "updated",
        viaLoader,
        latest,
        project: toLocalProject(mod, latest, { disabled, loader: viaLoader }),
      });
      continue;
    }

    if (!isMod) {
      items.push(keep());
      continue;
    }

    if (!state || state.status === "unknown") {
      items.push({ ...base, status: "unchecked" });
      continue;
    }

    items.push({
      ...base,
      status: isLibraryOnly(input.categories.get(key)) ? "library" : "missing",
    });
  }

  return items;
}

export function missingRequiredDependencies(
  items: PortItem[],
  alsoPresent: Iterable<string> = [],
): Map<string, { item: PortItem; projectIds: string[] }> {
  const present = new Set([
    ...items.filter((item) => item.project).map((item) => item.key),
    ...alsoPresent,
  ]);
  const missing = new Map<string, { item: PortItem; projectIds: string[] }>();

  for (const item of items) {
    if (item.status !== "updated" || !item.latest || !item.project) continue;

    const projectIds = item.latest.dependencies
      .filter(
        (dependency) =>
          dependency.relationType === DependencyType.REQUIRED &&
          !!dependency.projectId &&
          !present.has(entryKey(item.project!.provider, dependency.projectId)),
      )
      .map((dependency) => dependency.projectId);

    if (projectIds.length > 0) missing.set(item.key, { item, projectIds });
  }

  return missing;
}

export function portedProjects(items: PortItem[]): ILocalProject[] {
  return items.flatMap((item) => (item.project ? [item.project] : []));
}

export function countPort(items: PortItem[]): Record<PortStatus, number> {
  const counts: Record<PortStatus, number> = {
    updated: 0,
    added: 0,
    installed: 0,
    kept: 0,
    library: 0,
    missing: 0,
    unchecked: 0,
    localMod: 0,
  };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

export function renamedFiles(
  source: ILocalProject[],
  items: PortItem[],
  projectType: ProjectType,
): Map<string, string> {
  const before = new Map(
    source
      .filter((mod) => mod.projectType === projectType)
      .map((mod) => [
        entryKey(mod.provider, mod.id),
        mod.version?.files[0]?.filename ?? "",
      ]),
  );
  const renames = new Map<string, string>();

  for (const item of items) {
    if (item.projectType !== projectType || !item.project) continue;
    const previous = before.get(item.key);
    const next = item.project.version?.files[0]?.filename;
    if (previous && next && previous !== next) renames.set(previous, next);
  }

  return renames;
}

export function renameResourcePacks(
  options: string,
  renames: ReadonlyMap<string, string>,
): string {
  if (renames.size === 0) return options;

  return options
    .split(/(\r?\n)/)
    .map((line) => {
      if (!/^(resourcePacks|incompatibleResourcePacks):/.test(line)) return line;

      let next = line;
      for (const [previous, renamed] of renames) {
        next = next.split(`"file/${previous}"`).join(`"file/${renamed}"`);
      }
      return next;
    })
    .join("");
}
