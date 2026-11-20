import { ILocalProject, IVersion, ProjectType, Provider } from "@/types/ModManager";
import {
  IWorldSource,
  PublishedWorld,
  WORLD_SOURCE_FILE,
  WorldPublishPlan,
  parseWorldSource,
  planWorldPublish,
  sourceKey,
  worldSourceOf,
} from "@/shared/worldSource";
import { Version } from "@renderer/classes/Version";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

export async function writeWorldSource(
  worldPath: string,
  source: IWorldSource,
): Promise<boolean> {
  return api.fs
    .writeJSON(api.path.join(worldPath, WORLD_SOURCE_FILE), source)
    .catch(ignoreFailure)
    .then((written) => written === true);
}

async function worldFolders(versionPath: string): Promise<string[]> {
  const saves = api.path.join(versionPath, "saves");
  if (!(await api.fs.pathExists(saves).catch(ignoreFailure))) return [];
  return (await api.fs.getDirectories(saves).catch(ignoreFailure)) ?? [];
}

async function findEntryWorld(
  versionPath: string,
  entry: ILocalProject,
): Promise<{ folder: string; filename: string } | null> {
  for (const file of entry.version?.files ?? []) {
    const archives = [
      api.path.join(versionPath, "storage", "worlds", file.filename),
      file.localPath,
    ].filter((item): item is string => Boolean(item));

    for (const archive of archives) {
      if (!(await api.fs.pathExists(archive).catch(ignoreFailure))) continue;
      const name = await api.worlds.archiveName(archive).catch(ignoreFailure);
      if (name) return { folder: name, filename: file.filename };
    }
  }
  return null;
}

export async function adoptCatalogWorlds(version: Version): Promise<boolean> {
  const versionPath = version.versionPath;
  const saves = api.path.join(versionPath, "saves");
  const mods = version.version.loader.mods ?? [];
  const entries = mods.filter((mod) => mod.projectType === ProjectType.WORLD);

  for (const entry of entries) {
    const found = await findEntryWorld(versionPath, entry);
    if (!found) continue;
    const worldPath = api.path.join(saves, found.folder);
    if (!(await api.fs.pathExists(worldPath).catch(ignoreFailure))) continue;

    const source = worldSourceOf(entry, entry.version?.id, {
      filename: found.filename,
    });
    const marker = api.path.join(worldPath, WORLD_SOURCE_FILE);
    if (source && !(await api.fs.pathExists(marker).catch(ignoreFailure))) {
      await writeWorldSource(worldPath, source);
    }
  }

  let changed = false;
  for (const folder of await worldFolders(versionPath)) {
    const lock = api.path.join(saves, folder, ".downloaded");
    if (!(await api.fs.pathExists(lock).catch(ignoreFailure))) continue;
    await api.fs.rimraf(lock).catch(ignoreFailure);
    changed = true;
  }

  if (entries.length > 0) {
    version.version.loader.mods = mods.filter(
      (mod) => mod.projectType !== ProjectType.WORLD,
    );
    if (!(await version.save())) {
      version.version.loader.mods = mods;
      return changed;
    }
    changed = true;
  }

  if (changed) bumpInstanceDataRevision();
  return changed;
}

export async function listWorldSources(
  versionPath: string,
): Promise<PublishedWorld[]> {
  const saves = api.path.join(versionPath, "saves");
  const worlds: PublishedWorld[] = [];

  for (const folder of await worldFolders(versionPath)) {
    const worldPath = api.path.join(saves, folder);
    if (
      !(await api.fs
        .pathExists(api.path.join(worldPath, "level.dat"))
        .catch(ignoreFailure))
    ) {
      continue;
    }
    const raw = await api.fs
      .readJSON<unknown>(api.path.join(worldPath, WORLD_SOURCE_FILE), "utf-8")
      .catch(ignoreFailure);
    worlds.push({ folder, source: parseWorldSource(raw) });
  }

  return worlds;
}

async function availableVersions(
  worlds: readonly PublishedWorld[],
): Promise<Map<string, IVersion | null>> {
  const available = new Map<string, IVersion | null>();
  const byProject = new Map<string, IWorldSource[]>();

  for (const world of worlds) {
    if (!world.source) continue;
    const list = byProject.get(world.source.projectId) ?? [];
    list.push(world.source);
    byProject.set(world.source.projectId, list);
  }

  for (const [projectId, sources] of byProject) {
    const versions =
      (await api.modManager
        .getVersions(Provider.CURSEFORGE, projectId, {
          projectType: ProjectType.WORLD,
          modUrl: sources[0].url,
        })
        .catch(ignoreFailure)) ?? [];

    for (const source of sources) {
      available.set(
        sourceKey(source),
        versions.find((version) => version.id === source.fileId) ?? null,
      );
    }
  }

  return available;
}

export async function planPublishedWorlds(
  versionPath: string,
): Promise<WorldPublishPlan> {
  const worlds = await listWorldSources(versionPath);
  return planWorldPublish(worlds, await availableVersions(worlds));
}
