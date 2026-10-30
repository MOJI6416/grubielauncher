import type { Loader } from "@/types/Loader";
import {
  ILocalProject,
  IVersionDependency,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import type { IUpdateCheckItem } from "@/types/Updates";
import { entryKey } from "@renderer/features/mods/entries";
import {
  folderNameForType,
  listModFiles,
} from "@renderer/features/mods/modFiles";
import {
  buildUpdateItems,
  chunkUpdateItems,
  readUpdateVerdicts,
} from "@renderer/features/mods/updateQuery";
import {
  isCheckableProject,
  type UpdateState,
} from "@renderer/features/mods/updates";
import { resolveInstallPlan } from "@renderer/utilities/installPlan";
import {
  type PortItem,
  fallbackLoaderFor,
  localPathKey,
  missingRequiredDependencies,
  planPort,
  portedProjects,
} from "./portPlan";

const api = window.api;

export const PORT_CHECK_FAILED = "PORT_CHECK_FAILED";

export interface PortTarget {
  minecraftVersion: string;
  loader: Loader;
}

async function queryUpdates(
  items: IUpdateCheckItem[],
  target: PortTarget,
  loader: Loader,
  states: Map<string, UpdateState>,
): Promise<void> {
  for (const chunk of chunkUpdateItems(items)) {
    const response = await api.backend
      .checkUpdates({
        gameVersion: target.minecraftVersion,
        loader,
        items: chunk,
      })
      .catch(() => null);

    for (const [key, state] of readUpdateVerdicts(chunk, response?.items)) {
      states.set(key, state);
    }
  }
}

async function checkAgainst(
  items: IUpdateCheckItem[],
  target: PortTarget,
  loader: Loader,
): Promise<Map<string, UpdateState>> {
  const states = new Map<string, UpdateState>();
  await queryUpdates(items, target, loader, states);

  const unchecked = items.filter(
    (item) =>
      states.get(entryKey(item.provider, item.id))?.status === "unknown",
  );
  if (unchecked.length > 0) {
    await queryUpdates(unchecked, target, loader, states);
  }

  return states;
}

async function readSourceFiles(
  versionPath: string,
  mods: ILocalProject[],
): Promise<{ disabled: Set<string>; localPaths: Map<string, string> }> {
  const disabled = new Set<string>();
  const localPaths = new Map<string, string>();

  for (const mod of mods) {
    const key = entryKey(mod.provider, mod.id);

    if (mod.projectType === ProjectType.WORLD) {
      for (const file of mod.version?.files ?? []) {
        const zip = api.path.join(versionPath, "storage", "worlds", file.filename);
        if (await api.fs.pathExists(zip)) {
          localPaths.set(localPathKey(key, file.filename), zip);
        }
      }
      continue;
    }

    const listing = await listModFiles(versionPath, mod.projectType);
    const folder = api.path.join(
      versionPath,
      await folderNameForType(mod.projectType),
    );

    for (const file of mod.version?.files ?? []) {
      const off = `${file.filename}.disabled`;
      if (listing.has(off)) {
        disabled.add(key);
        localPaths.set(localPathKey(key, file.filename), api.path.join(folder, off));
      } else if (listing.has(file.filename)) {
        localPaths.set(
          localPathKey(key, file.filename),
          api.path.join(folder, file.filename),
        );
      }
    }
  }

  return { disabled, localPaths };
}

async function addDependencies(
  items: PortItem[],
  target: PortTarget,
  fallbackLoader: Loader | undefined,
  installed: ILocalProject[],
): Promise<PortItem[]> {
  const missing = missingRequiredDependencies(
    items,
    installed.map((mod) => entryKey(mod.provider, mod.id)),
  );
  if (missing.size === 0) return items;

  const added: PortItem[] = [];
  const unresolved = new Set<string>();

  for (const { item, projectIds } of missing.values()) {
    const project = item.project!;
    const wanted = new Set(projectIds);
    const dependencies = (item.latest?.dependencies ?? []).filter(
      (dependency) => wanted.has(dependency.projectId),
    );

    const resolved: IVersionDependency[] | null = await api.modManager
      .getDependencies(project.provider, project.id, dependencies)
      .catch(() => null);

    for (const dependency of resolved ?? []) {
      if (!dependency.project) continue;

      const root = dependency.project;
      const resolveWith = (loader: Loader) =>
        resolveInstallPlan({
          root,
          installed: [
            ...installed,
            ...portedProjects(items),
            ...portedProjects(added),
          ],
          minecraftVersion: target.minecraftVersion,
          resolveLoader: () => loader,
        }).catch(() => null);
      const usable = (plan: Awaited<ReturnType<typeof resolveWith>>) =>
        !!plan && !plan.rootMissingVersion && !plan.dependenciesUnavailable;

      let plan = await resolveWith(target.loader);
      let viaLoader: Loader | undefined;
      if (!usable(plan) && fallbackLoader) {
        const retry = await resolveWith(fallbackLoader);
        if (usable(retry)) {
          plan = retry;
          viaLoader = fallbackLoader;
        }
      }

      if (!plan || !usable(plan)) {
        const key = entryKey(dependency.project.provider, dependency.project.id);
        if (!unresolved.has(key)) {
          unresolved.add(key);
          added.push({
            key,
            title: dependency.project.title,
            projectType: dependency.project.projectType,
            status: "missing",
          });
        }
        continue;
      }

      for (const project of plan.added) {
        added.push({
          key: entryKey(project.provider, project.id),
          title: project.title,
          projectType: project.projectType,
          status: "added",
          viaLoader,
          project: viaLoader ? { ...project, loader: viaLoader } : project,
        });
      }
    }
  }

  return [...items, ...added];
}

export async function analyzePort(
  versionPath: string,
  mods: ILocalProject[],
  target: PortTarget,
  options: { includeWorlds: boolean; installed?: ILocalProject[] },
): Promise<PortItem[]> {
  const content = mods.filter(
    (mod) =>
      mod.projectType !== ProjectType.PLUGIN &&
      (options.includeWorlds || mod.projectType !== ProjectType.WORLD),
  );
  const catalog = content.filter(
    (mod) => mod.projectType !== ProjectType.WORLD && isCheckableProject(mod),
  );

  const primary = await checkAgainst(
    buildUpdateItems(catalog),
    target,
    target.loader,
  );

  if (
    catalog.length > 0 &&
    [...primary.values()].every((state) => state.status === "unknown")
  ) {
    throw new Error(PORT_CHECK_FAILED);
  }

  const fallbackLoader = fallbackLoaderFor(
    target.loader,
    target.minecraftVersion,
  );
  const retry = fallbackLoader
    ? catalog.filter(
        (mod) =>
          mod.projectType === ProjectType.MOD &&
          primary.get(entryKey(mod.provider, mod.id))?.status === "unavailable",
      )
    : [];
  const fallback =
    fallbackLoader && retry.length > 0
      ? await checkAgainst(buildUpdateItems(retry), target, fallbackLoader)
      : new Map<string, UpdateState>();

  const gone = catalog.filter((mod) => {
    if (mod.projectType !== ProjectType.MOD) return false;
    const key = entryKey(mod.provider, mod.id);
    return (
      primary.get(key)?.status === "unavailable" &&
      fallback.get(key)?.status !== "update" &&
      fallback.get(key)?.status !== "current"
    );
  });
  const categories = new Map<string, string[]>(
    Object.entries(
      gone.length > 0
        ? await api.modManager
            .projectCategories(
              gone
                .filter((mod) => mod.provider === Provider.MODRINTH)
                .map((mod) => mod.id),
              gone
                .filter((mod) => mod.provider === Provider.CURSEFORGE)
                .map((mod) => mod.id),
            )
            .catch(() => ({}))
        : {},
    ),
  );

  const files = versionPath
    ? await readSourceFiles(versionPath, content)
    : { disabled: new Set<string>(), localPaths: new Map<string, string>() };

  const items = planPort({
    mods: content,
    primary,
    fallback,
    fallbackLoader,
    disabled: files.disabled,
    categories,
    localPaths: files.localPaths,
    includeWorlds: options.includeWorlds,
  });

  return await addDependencies(
    items,
    target,
    fallbackLoader,
    options.installed ?? [],
  );
}
