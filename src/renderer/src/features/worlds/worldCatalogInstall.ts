import {
  ILocalFile,
  IProject,
  IVersion as ModVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import type { TSettings } from "@/types/Settings";
import { resolveUpdateChannel } from "@/shared/updateChannel";
import { Version } from "@renderer/classes/Version";
import { instanceFetchers } from "@renderer/features/catalogInstall/installToInstance";
import { channelVersions } from "@renderer/features/mods/updates";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

export const WORLD_CATALOG_PROVIDERS: Record<
  ProjectType.WORLD | ProjectType.DATAPACK,
  (Provider.MODRINTH | Provider.CURSEFORGE)[]
> = {
  [ProjectType.WORLD]: [Provider.CURSEFORGE],
  [ProjectType.DATAPACK]: [Provider.MODRINTH, Provider.CURSEFORGE],
};

export type CatalogInstallOutcome =
  | { status: "installed"; path: string; name: string }
  | { status: "already" }
  | { status: "noVersion" }
  | { status: "blocked"; url: string }
  | { status: "failed"; reason?: string };

export function pickArchiveFile(version: ModVersion): ILocalFile | null {
  return (
    version.files.find(
      (file) => file.url && /\.zip$/i.test(file.filename ?? ""),
    ) ?? null
  );
}

export function safeFileName(name: string): string | null {
  const base = name.split(/[\\/]/).pop()?.trim() ?? "";
  if (!base || base === "." || base === ".." || /[<>:"|?*]/.test(base)) {
    return null;
  }
  return base;
}

export async function pickCatalogVersion(
  instance: Version,
  project: IProject,
  settings: TSettings,
): Promise<ModVersion | null> {
  const versions = await instanceFetchers(instance).fetchVersions(project);
  if (!versions.length) return null;

  const channel = resolveUpdateChannel({
    instance: instance.version.updateChannel,
    global: settings.modUpdateChannel,
    gameVersionType: instance.version.version.type,
  });
  const archives = versions.filter((version) => pickArchiveFile(version));
  if (!archives.length) return null;
  return channelVersions(archives, channel)[0] ?? null;
}

async function download(
  file: ILocalFile,
  destination: string,
  settings: TSettings,
): Promise<boolean> {
  await api.fs.ensure(api.path.join(destination, ".."));
  await api.file.download(
    [
      {
        destination,
        group: "worlds",
        url: file.url,
        sha1: file.sha1 || undefined,
        size: file.size || undefined,
      },
    ],
    settings.downloadLimit,
  );
  return api.fs.pathExists(destination);
}

export async function installCatalogWorld(
  instance: Version,
  project: IProject,
  settings: TSettings,
): Promise<CatalogInstallOutcome> {
  const version = await pickCatalogVersion(instance, project, settings);
  const file = version ? pickArchiveFile(version) : null;
  if (!file) return { status: "noVersion" };
  if (file.url.startsWith("blocked::")) {
    return { status: "blocked", url: project.url };
  }

  const name = safeFileName(file.filename);
  if (!name) return { status: "failed" };

  const archive = api.path.join(
    instance.versionPath,
    "storage",
    "catalog-worlds",
    `${Date.now()}-${name}`,
  );

  try {
    if (!(await download(file, archive, settings))) return { status: "failed" };

    const result = await api.worlds.import(archive, instance.versionPath, true);
    if (!result?.ok) {
      return { status: "failed", reason: result?.error ?? "failed" };
    }
    return { status: "installed", path: result.path, name: result.name };
  } finally {
    await api.fs.rimraf(archive).catch(ignoreFailure);
  }
}

export async function installCatalogDatapack(
  instance: Version,
  worldPath: string,
  installed: string[],
  project: IProject,
  settings: TSettings,
): Promise<CatalogInstallOutcome> {
  const version = await pickCatalogVersion(instance, project, settings);
  const file = version ? pickArchiveFile(version) : null;
  if (!file) return { status: "noVersion" };
  if (file.url.startsWith("blocked::")) {
    return { status: "blocked", url: project.url };
  }

  const name = safeFileName(file.filename);
  if (!name) return { status: "failed" };
  if (installed.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
    return { status: "already" };
  }

  const target = api.path.join(worldPath, "datapacks", name);
  if (await api.fs.pathExists(target)) return { status: "already" };

  if (!(await download(file, target, settings))) return { status: "failed" };
  return { status: "installed", path: target, name };
}
