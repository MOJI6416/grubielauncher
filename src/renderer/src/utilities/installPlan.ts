import { Loader } from "@/types/Loader";
import {
  DependencyType,
  ILocalProject,
  IProject,
  ProjectType,
} from "@/types/ModManager";
import {
  buildInstalledIndex,
  findInstalledProject,
  normalizeProjectTitle,
} from "./mod";

const api = window.api;

export interface InstallPlanOptions {
  root: IProject;
  installed: ILocalProject[];
  minecraftVersion: string;
  resolveLoader: (projectType: ProjectType) => Loader;
}

export interface InstallPlan {
  added: ILocalProject[];
  rootMissingVersion: boolean;
  dependenciesUnavailable: boolean;
}

export async function resolveInstallPlan({
  root,
  installed,
  minecraftVersion,
  resolveLoader,
}: InstallPlanOptions): Promise<InstallPlan> {
  const index = buildInstalledIndex(installed);
  const added: ILocalProject[] = [];
  const seenIds = new Set<string>(
    installed.map((mod) => `${mod.provider}:${mod.id}`),
  );
  const seenTitles = new Set<string>(
    installed.map((mod) => normalizeProjectTitle(mod.title)).filter(Boolean),
  );

  const isHandled = (project: IProject) => {
    const title = normalizeProjectTitle(project.title);
    return (
      seenIds.has(`${project.provider}:${project.id}`) ||
      (!!title && seenTitles.has(title)) ||
      !!findInstalledProject(index, project)
    );
  };

  const queue: IProject[] = [root];
  let rootMissingVersion = false;
  let dependenciesUnavailable = false;

  while (queue.length) {
    const project = queue.shift()!;
    if (isHandled(project)) continue;

    const versions = await api.modManager.getVersions(
      project.provider,
      project.id,
      {
        loader: resolveLoader(project.projectType),
        version: minecraftVersion,
        projectType: project.projectType,
        modUrl: project.url,
      },
    );

    const latest = versions[0];
    if (!latest) {
      if (project.id == root.id) rootMissingVersion = true;
      continue;
    }

    const resolvedDeps = latest.dependencies.length
      ? await api.modManager.getDependencies(
          project.provider,
          project.id,
          latest.dependencies,
        )
      : [];

    if (!resolvedDeps) {
      dependenciesUnavailable = true;
      return { added: [], rootMissingVersion, dependenciesUnavailable };
    }

    added.push({
      title: project.title,
      description: project.description,
      projectType: project.projectType,
      iconUrl: project.iconUrl,
      url: project.url,
      provider: project.provider,
      id: project.id,
      version: {
        id: latest.id,
        files: latest.files.map((file) => ({
          filename: file.filename,
          size: file.size,
          isServer: file.isServer,
          isClient: file.isClient,
          url: file.url,
          sha1: file.sha1,
        })),
        dependencies: resolvedDeps.map((dependency) => ({
          title: dependency.project?.title || "",
          projectId: dependency.projectId
            ? String(dependency.projectId)
            : undefined,
          relationType: dependency.relationType,
        })),
      },
    });

    const title = normalizeProjectTitle(project.title);
    seenIds.add(`${project.provider}:${project.id}`);
    if (title) seenTitles.add(title);

    for (const dependency of resolvedDeps) {
      if (
        dependency.relationType == DependencyType.REQUIRED &&
        dependency.project &&
        !isHandled(dependency.project)
      ) {
        queue.push(dependency.project);
      }
    }
  }

  return { added, rootMissingVersion, dependenciesUnavailable };
}
