import {
  DependencyType,
  ILocalProject,
  IProject,
  IVersion as ModVersion,
  IVersionDependency,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import type { IServerConf } from "@/types/Server";
import type { Loader } from "@/types/Loader";
import type { TSettings } from "@/types/Settings";
import {
  DEFAULT_UPDATE_CHANNEL,
  resolveUpdateChannel,
  type UpdateChannel,
} from "@/shared/updateChannel";
import { Version } from "@renderer/classes/Version";
import { Mods } from "@renderer/classes/Mods";
import { checkBlockedMods } from "@renderer/utilities/blockedMods";
import {
  buildInstalledIndex,
  findInstalledProject,
} from "@renderer/utilities/mod";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import {
  planQuickInstall,
  toLocalProject,
  type QuickInstallFetchers,
} from "@renderer/features/mods/updates";
import { sharedTagLoader } from "@renderer/features/mods/catalogLoader";
import { forgetAllModFiles } from "@renderer/features/mods/modFiles";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";

const api = window.api;

export const INSTALL_BLOCKED = "catalog-install-blocked";

export type InstallOutcome =
  | {
      status: "installed";
      added: ILocalProject[];
      missingDependencies: IProject[];
    }
  | { status: "already" }
  | { status: "noVersion" };

export function instanceFetchers(instance: Version): QuickInstallFetchers {
  const conf = instance.version;
  const loader = conf.loader.name;

  return {
    fetchVersions: async (project: IProject) => {
      const request = (target: Loader) =>
        api.modManager
          .getVersions(project.provider, project.id, {
            loader: target,
            version: conf.version.id,
            projectType: project.projectType,
            modUrl: project.url,
          })
          .catch(ignoreFailure)
          .then((list) => list ?? []);

      const versions = await request(loader || "vanilla");
      const fallback = sharedTagLoader(
        loader,
        loader || "vanilla",
        project.projectType,
      );
      return versions.length > 0 || !fallback ? versions : request(fallback);
    },
    fetchDependencies: async (
      project: IProject,
      deps: IVersionDependency[],
    ) =>
      (await api.modManager
        .getDependencies(project.provider, project.id, deps)
        .catch(ignoreFailure)) ?? [],
  };
}

export function findInInstance(
  instance: Version,
  project: Pick<IProject, "provider" | "id" | "title" | "projectType">,
): ILocalProject | undefined {
  return findInstalledProject(
    buildInstalledIndex(instance.version.loader.mods ?? []),
    project,
  );
}

async function readServerConf(
  instance: Version,
): Promise<IServerConf | undefined> {
  const file = await api.path.join(instance.versionPath, "server", "conf.json");
  if (!(await api.fs.pathExists(file).catch(ignoreFailure))) return undefined;
  return (
    (await api.fs.readJSON<IServerConf>(file, "utf-8").catch(ignoreFailure)) ??
    undefined
  );
}

export async function planInstallInto(
  instance: Version,
  project: IProject,
  versionId?: string,
  globalChannel: UpdateChannel = DEFAULT_UPDATE_CHANNEL,
): Promise<InstallOutcome> {
  const mods = instance.version.loader.mods ?? [];
  if (findInInstance(instance, project)) return { status: "already" };

  const fetchers = instanceFetchers(instance);
  const channel = resolveUpdateChannel({
    instance: instance.version.updateChannel,
    global: globalChannel,
    gameVersionType: instance.version.version.type,
  });

  if (versionId) {
    const versions = await fetchers.fetchVersions(project);
    const explicit = versions.find((item) => item.id === versionId);
    if (explicit) {
      const local = toLocalProject(project, explicit, { disabled: false });
      let next = [...mods, local];
      const added = [local];
      const missingDependencies: IProject[] = [];
      const required = (explicit.dependencies ?? []).filter(
        (dep) => dep.relationType === DependencyType.REQUIRED && dep.project,
      );
      for (const dep of required) {
        if (!dep.project) continue;
        if (findInstalledProject(buildInstalledIndex(next), dep.project)) {
          continue;
        }
        const plan = await planQuickInstall(dep.project, next, fetchers, {
          requiredBy: explicit,
          channel,
        });
        next = [...next, ...plan.added];
        added.push(...plan.added);
        missingDependencies.push(...plan.missingDependencies);
      }
      return { status: "installed", added, missingDependencies };
    }
  }

  const plan = await planQuickInstall(project, mods, fetchers, { channel });
  if (plan.added.length === 0) {
    return plan.rootMissingVersion
      ? { status: "noVersion" }
      : { status: "already" };
  }
  return {
    status: "installed",
    added: plan.added,
    missingDependencies: plan.missingDependencies,
  };
}

export async function commitInstallInto(
  instance: Version,
  added: ILocalProject[],
  settings: TSettings,
): Promise<void> {
  const conf = instance.version;
  const previous = conf.loader.mods ?? [];
  const checked = await checkBlockedMods(
    [...previous, ...added],
    instance.versionPath,
  );
  if (checked.blockedMods.length > 0) throw new Error(INSTALL_BLOCKED);

  conf.loader.mods = checked.mods;
  try {
    const server = await readServerConf(instance);
    await new Mods(settings, conf, server).check({
      downloadReasons: Object.fromEntries(
        added.map((mod, index) => [
          mod.id,
          index === 0 ? "standalone" : "dependency",
        ]),
      ),
    });
    if (!(await instance.save())) throw new Error("version save failed");
  } catch (error) {
    conf.loader.mods = previous;
    throw error;
  }

  forgetAllModFiles(instance.versionPath);
  bumpInstanceDataRevision();
}

export function isCatalogProvider(
  provider: Provider,
): provider is Provider.MODRINTH | Provider.CURSEFORGE {
  return provider === Provider.MODRINTH || provider === Provider.CURSEFORGE;
}

export const INSTALLABLE_TYPES = new Set<ProjectType>([
  ProjectType.MOD,
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
]);

export function pickModpackVersion(
  versions: ModVersion[],
  versionId?: string,
): ModVersion | undefined {
  return (
    (versionId && versions.find((item) => item.id === versionId)) ||
    versions[0]
  );
}
