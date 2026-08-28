import {
  DependencyType,
  ILocalProject,
  IProject,
  IVersion as ModVersion,
  IVersionDependency,
  Provider,
} from "@/types/ModManager";
import { normalizeProjectTitle } from "@renderer/utilities/mod";
import { applyDisabledState, entryKey } from "./entries";

export type UpdateStatus = "current" | "update" | "unavailable" | "unknown";

export interface UpdateState {
  status: UpdateStatus;
  latest: ModVersion | null;
}

export function isCheckableProject(mod: ILocalProject): boolean {
  return mod.provider === Provider.CURSEFORGE ||
    mod.provider === Provider.MODRINTH
    ? Boolean(mod.id)
    : false;
}

export function collectUpdatable(
  states: ReadonlyMap<string, UpdateState>,
): Set<string> {
  const keys = new Set<string>();
  for (const [key, state] of states) {
    if (state.status === "update") keys.add(key);
  }
  return keys;
}

export function collectUnavailable(
  states: ReadonlyMap<string, UpdateState>,
): Set<string> {
  const keys = new Set<string>();
  for (const [key, state] of states) {
    if (state.status === "unavailable") keys.add(key);
  }
  return keys;
}

export function toLocalDependencies(deps: IVersionDependency[]) {
  return deps.map((dep) => ({
    title: dep.project?.title || "",
    projectId: dep.projectId ? String(dep.projectId) : undefined,
    relationType: dep.relationType,
  }));
}

export function toLocalProject(
  project: Pick<
    IProject,
    "title" | "description" | "projectType" | "iconUrl" | "url" | "provider" | "id"
  >,
  version: ModVersion,
  options: { disabled?: boolean; keepLocalPath?: boolean } = {},
): ILocalProject {
  const files = version.files.map((file) => ({
    filename: file.filename,
    size: file.size,
    isServer: file.isServer,
    isClient: file.isClient,
    url: file.url,
    sha1: file.sha1,
    localPath: options.keepLocalPath ? file.localPath : undefined,
  }));

  return {
    title: project.title,
    description: project.description,
    projectType: project.projectType,
    iconUrl: project.iconUrl,
    url: project.url,
    provider: project.provider,
    id: project.id,
    version: {
      id: version.id,
      files: applyDisabledState(files, options.disabled === true),
      dependencies: toLocalDependencies(version.dependencies ?? []),
    },
  };
}

export function applyUpdates(
  mods: ILocalProject[],
  updates: ReadonlyMap<string, ModVersion>,
  disabledKeys: ReadonlySet<string>,
): { mods: ILocalProject[]; updated: number } {
  let updated = 0;

  const next = mods.map((mod) => {
    const key = entryKey(mod.provider, mod.id);
    const version = updates.get(key);
    if (!version) return mod;

    updated += 1;
    return toLocalProject(mod, version, { disabled: disabledKeys.has(key) });
  });

  return { mods: next, updated };
}

export interface QuickInstallFetchers {
  fetchVersions: (project: IProject) => Promise<ModVersion[]>;
  fetchDependencies: (
    project: IProject,
    deps: IVersionDependency[],
  ) => Promise<IVersionDependency[]>;
}

export interface QuickInstallPlan {
  added: ILocalProject[];
  rootMissingVersion: boolean;
}

export async function planQuickInstall(
  root: IProject,
  installed: ILocalProject[],
  fetchers: QuickInstallFetchers,
): Promise<QuickInstallPlan> {
  const seenIds = new Set(
    installed.map((mod) => entryKey(mod.provider, mod.id)),
  );
  const seenTitles = new Set(
    installed.map((mod) => normalizeProjectTitle(mod.title)).filter(Boolean),
  );

  const isHandled = (project: IProject) => {
    const title = normalizeProjectTitle(project.title);
    return (
      seenIds.has(entryKey(project.provider, project.id)) ||
      (!!title && seenTitles.has(title))
    );
  };

  const added: ILocalProject[] = [];
  const queue: IProject[] = [root];
  let rootMissingVersion = false;

  while (queue.length) {
    const project = queue.shift()!;
    if (isHandled(project)) continue;

    const versions = await fetchers.fetchVersions(project);
    const latest = versions[0];

    if (!latest) {
      if (project.id === root.id && project.provider === root.provider) {
        rootMissingVersion = true;
      }
      continue;
    }

    const dependencies = latest.dependencies?.length
      ? await fetchers.fetchDependencies(project, latest.dependencies)
      : [];

    added.push(
      toLocalProject(project, { ...latest, dependencies }, { disabled: false }),
    );

    seenIds.add(entryKey(project.provider, project.id));
    const title = normalizeProjectTitle(project.title);
    if (title) seenTitles.add(title);

    for (const dep of dependencies) {
      if (dep.relationType !== DependencyType.REQUIRED) continue;
      if (!dep.project) continue;
      if (isHandled(dep.project)) continue;
      queue.push(dep.project);
    }
  }

  return { added, rootMissingVersion };
}
