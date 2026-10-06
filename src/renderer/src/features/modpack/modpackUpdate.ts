import type { ILocalAccount } from "@/types/Account";
import type { IVersionConf } from "@/types/IVersion";
import type {
  IModpack as IImportedModpack,
  IProject,
  IVersion as IProjectVersion,
} from "@/types/ModManager";
import type {
  IModpackSource,
  ModpackBase,
  ModpackFilesPlan,
} from "@/types/ModpackSource";
import type { IServerConf } from "@/types/Server";
import type { TSettings } from "@/types/Settings";
import { isModdedLoader } from "@/shared/loaderCompat";
import {
  baseProjectsOf,
  mergeModpackMods,
  packLocalContentPaths,
  type ModpackMergeResult,
} from "@/shared/modpackMerge";
import { Mods } from "@renderer/classes/Mods";
import { Version } from "@renderer/classes/Version";
import {
  applyBlockedModFilePaths,
  checkBlockedMods,
  type IBlockedMod,
} from "@renderer/utilities/blockedMods";
import {
  downloadModpack,
  readBlockedModpack,
  type ModpackDownloadStage,
} from "@renderer/features/newInstance/downloadModpack";
import { rewriteImportedLocalPaths } from "@renderer/features/newInstance/createInstance";
import { resolvePackVersions } from "@renderer/features/newInstance/resolvePackVersions";
import { withExtractProgress } from "@renderer/utilities/archiveProgress";
import { modpackVersionLabel } from "./modpackVersions";

const api = window.api;

export const MODPACK_UPDATE_FAILED = "MODPACK_UPDATE_FAILED";

export interface PreparedModpackUpdate {
  project: IProject;
  target: IProjectVersion;
  pack: IImportedModpack;
  base: ModpackBase;
  merge: ModpackMergeResult;
  files: ModpackFilesPlan;
  loaderTarget: string | null;
}

export type ModpackPrepareResult =
  | { status: "ready"; update: PreparedModpackUpdate }
  | { status: "blockedPack"; blocked: IBlockedMod }
  | { status: "otherGame"; gameVersion: string }
  | { status: "noBase" }
  | { status: "loaderMissing" }
  | { status: "notModpack" }
  | { status: "otherProject"; title: string }
  | { status: "failed"; error?: unknown };

export type ModpackApplyOutcome =
  | { status: "done"; extraFilesFailed: boolean }
  | { status: "blockedMods"; blocked: IBlockedMod[] };

function sameLoaderFamily(conf: IVersionConf, pack: IImportedModpack): boolean {
  return (pack.loader ?? "vanilla") === conf.loader.name;
}

function cloneConf(conf: IVersionConf): IVersionConf {
  return JSON.parse(JSON.stringify(conf)) as IVersionConf;
}

export function remergeModpackUpdate(
  update: PreparedModpackUpdate,
  current: IVersionConf,
  restoreRemoved: boolean,
): PreparedModpackUpdate {
  return {
    ...update,
    merge: mergeModpackMods({
      base: update.base.projects,
      current: current.loader.mods ?? [],
      next: update.pack.mods,
      restoreRemoved,
    }),
  };
}

export async function discardPreparedUpdate(
  update: Pick<PreparedModpackUpdate, "pack"> | null | undefined,
): Promise<void> {
  if (!update?.pack.folderPath) return;
  await api.fs.rimraf(update.pack.folderPath).catch(() => undefined);
}

async function planPreparedUpdate(
  instance: Version,
  project: IProject,
  target: IProjectVersion,
  pack: IImportedModpack,
): Promise<ModpackPrepareResult> {
  const conf = instance.version;
  const discard = () => discardPreparedUpdate({ pack });

  const base = await api.modpack.readBase(instance.versionPath);
  if (!base) {
    await discard();
    return { status: "noBase" };
  }

  if (pack.version !== conf.version.id || !sameLoaderFamily(conf, pack)) {
    await discard();
    return { status: "otherGame", gameVersion: pack.version };
  }

  let loaderTarget: string | null = null;
  if (
    isModdedLoader(conf.loader.name) &&
    pack.loaderVersion &&
    pack.loaderVersion !== base.loaderVersion
  ) {
    const resolution = await resolvePackVersions(pack);
    const resolved = resolution.loaderVersion?.id;
    if (!resolved) {
      await discard();
      return { status: "loaderMissing" };
    }
    if (resolved !== conf.loader.version?.id) loaderTarget = resolved;
  }

  const files = await api.modpack.planFiles(
    instance.versionPath,
    pack.folderPath,
    pack.extraFiles ?? [],
  );
  if (!files) {
    await discard();
    return { status: "noBase" };
  }

  return {
    status: "ready",
    update: {
      project,
      target,
      pack,
      base,
      files,
      loaderTarget,
      merge: mergeModpackMods({
        base: base.projects,
        current: conf.loader.mods ?? [],
        next: pack.mods,
      }),
    },
  };
}

export async function prepareModpackUpdate(input: {
  instance: Version;
  project: IProject;
  target: IProjectVersion;
  blockedFilePath?: string;
  onStage: (stage: ModpackDownloadStage) => void;
  onExtractPercent?: (percent: number) => void;
}): Promise<ModpackPrepareResult> {
  const { instance, project, target } = input;

  if (!(await api.modpack.readBase(instance.versionPath))) {
    return { status: "noBase" };
  }

  const result = input.blockedFilePath
    ? await readBlockedModpack(
        input.blockedFilePath,
        project,
        target,
        input.onStage,
        input.onExtractPercent,
      )
    : await downloadModpack(
        project,
        target,
        input.onStage,
        input.onExtractPercent,
      );

  if (result.status === "blocked") {
    return { status: "blockedPack", blocked: result.blocked };
  }
  if (result.status === "failed") {
    return { status: "failed", error: result.error };
  }

  return planPreparedUpdate(instance, project, target, result.modpack);
}

export async function prepareModpackUpdateFromFile(input: {
  instance: Version;
  project: IProject;
  versions: IProjectVersion[];
  filePath: string;
  tempPath: string;
  onExtractPercent?: (percent: number) => void;
}): Promise<ModpackPrepareResult> {
  const { instance, project } = input;

  try {
    const imported = await withExtractProgress(
      input.filePath,
      input.onExtractPercent,
      () => api.version.import(input.filePath, input.tempPath),
    );

    if (imported.type !== "other" || !imported.other) {
      if (imported.gl?.path) {
        await api.fs.rimraf(imported.gl.path).catch(() => undefined);
      }
      return { status: "notModpack" };
    }

    const pack = imported.other;
    const linked = instance.version.modpack;
    if (pack.source && linked && pack.source.projectId !== linked.projectId) {
      await discardPreparedUpdate({ pack });
      return { status: "otherProject", title: pack.source.title };
    }

    const fileName = await api.path.basename(input.filePath);
    const label = pack.source?.versionNumber || pack.versionId || fileName;
    const target: IProjectVersion = input.versions.find(
      (version) => version.id === pack.source?.versionId,
    ) ?? {
      id: pack.source?.versionId ?? `file:${label}`,
      name: label,
      versionNumber: label,
      dependencies: [],
      downloads: 0,
      files: [],
    };

    return planPreparedUpdate(instance, project, target, pack);
  } catch (error) {
    return { status: "failed", error };
  }
}

function nextSource(
  instance: Version,
  update: PreparedModpackUpdate,
): IModpackSource | undefined {
  const current = instance.version.modpack;
  if (!current) return update.pack.source;

  return {
    ...current,
    versionId: update.target.id,
    versionNumber: modpackVersionLabel(update.target),
    title: update.project.title || current.title,
    url: update.project.url || current.url,
    publishedAt: update.target.datePublished,
    releaseType: update.target.releaseType,
  };
}

async function restoreLoader(
  instance: Version,
  previous: IVersionConf,
  account: ILocalAccount,
  settings: TSettings,
): Promise<void> {
  const previousLoader = previous.loader.version?.id;
  if (!previousLoader || previousLoader === instance.version.loader.version?.id) {
    return;
  }

  await instance
    .changeLoader(account, settings, previousLoader)
    .catch(() => undefined);
}

export async function applyModpackUpdate(input: {
  instance: Version;
  update: PreparedModpackUpdate;
  account: ILocalAccount;
  settings: TSettings;
  server?: IServerConf;
  resolvedBlocked?: IBlockedMod[];
}): Promise<ModpackApplyOutcome> {
  const { instance, update, account, settings } = input;
  const versionPath = instance.versionPath;
  const root = update.pack.folderPath;
  const mods = update.merge.mods;

  if (input.resolvedBlocked?.length) {
    applyBlockedModFilePaths(mods, input.resolvedBlocked);
  }

  const blocked = await checkBlockedMods(mods, versionPath);
  if (blocked.blockedMods.length > 0) {
    return { status: "blockedMods", blocked: blocked.blockedMods };
  }

  const previous = cloneConf(instance.version);

  if (update.loaderTarget) {
    await instance.changeLoader(account, settings, update.loaderTarget);
  }

  const applied = await api.modpack.applyFiles(
    versionPath,
    root,
    update.pack.extraFiles ?? [],
    update.files,
    previous,
    modpackVersionLabel(update.target),
    packLocalContentPaths(mods, root),
  );

  if (!applied) {
    await restoreLoader(instance, previous, account, settings);
    throw new Error(MODPACK_UPDATE_FAILED);
  }

  let extraFilesFailed = false;
  if (applied.downloads.length > 0) {
    const downloaded = await api.file.download(
      applied.downloads.map((item) => ({ ...item, group: "other" })),
      settings.downloadLimit,
    );
    extraFilesFailed = downloaded === false;
  }

  instance.version.loader.mods = blocked.mods;
  instance.version.modpack = nextSource(instance, update);

  try {
    await new Mods(settings, instance.version, input.server).check({
      operation: "update",
    });
  } catch (error) {
    instance.version.loader.mods = previous.loader.mods;
    instance.version.modpack = previous.modpack;
    await api.modpack.restoreRollback(versionPath).catch(() => null);
    await api.modpack.dropRollback(versionPath).catch(() => false);
    await restoreLoader(instance, previous, account, settings);
    await instance.save().catch(() => false);
    throw error;
  }

  rewriteImportedLocalPaths(instance.version.loader.mods, root, versionPath);
  instance.version.lastUpdate = new Date();

  await api.modpack.writeBase(versionPath, root, {
    versionId: update.target.id,
    loaderVersion: update.pack.loaderVersion,
    projects: baseProjectsOf(update.pack.mods),
    extraFiles: update.pack.extraFiles ?? [],
  });

  if (!(await instance.save())) throw new Error(MODPACK_UPDATE_FAILED);

  await discardPreparedUpdate(update);

  return { status: "done", extraFilesFailed };
}

export async function rollbackModpackUpdate(input: {
  instance: Version;
  account: ILocalAccount;
  settings: TSettings;
  server?: IServerConf;
}): Promise<boolean> {
  const { instance, account, settings } = input;

  const restored = await api.modpack.restoreRollback(instance.versionPath);
  if (!restored) return false;

  const previous = restored.conf;
  const previousLoader = previous.loader.version?.id;
  if (
    previousLoader &&
    isModdedLoader(instance.version.loader.name) &&
    previousLoader !== instance.version.loader.version?.id
  ) {
    await instance.changeLoader(account, settings, previousLoader);
  }

  instance.version.loader.mods = previous.loader.mods;
  instance.version.modpack = previous.modpack;

  await new Mods(settings, instance.version, input.server).check({
    operation: "update",
  });

  if (!(await instance.save())) return false;
  await api.modpack.dropRollback(instance.versionPath);

  return true;
}
