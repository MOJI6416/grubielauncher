import { IAuth, ILocalAccount } from "@/types/Account";
import { AuthlibEnsureResult } from "@/types/IAuthlib";
import {
  IImportModpack,
  IVersionClassData,
  IVersionConf,
  VersionDeleteResult,
} from "@/types/IVersion";
import { TSettings } from "@/types/Settings";
import { Version } from "../game/Version";
import { DownloadItem } from "@/types/Downloader";
import { importVersion } from "../utilities/versions";
import { sendProgress, throttleProgress } from "../utilities/progressEvents";
import { ArchiveExtractProgress } from "@/types/Archive";
import { uploadMods } from "../utilities/share";
import { check, handleSafe } from "../utilities/ipc";
import { assertReadablePath, assertWritablePath } from "../utilities/safePath";
import {
  DownloadPauseState,
  getDownloadPauseState,
  pauseDownloads,
  resumeDownloads,
} from "../utilities/downloader";
import { ILocalProject } from "@/types/ModManager";
import {
  LOADER_CHANGE_NOT_FOUND,
  LOADER_CHANGE_RUNNING,
  LoaderChangeResult,
  VersionInstallOptions,
  VersionInstallResult,
} from "@/types/InstallationProgress";
import { LoaderVersion } from "@/types/VersionsService";
import {
  LOADER_VERSION_ID_PATTERN,
  LoaderRequirementsScan,
  isModdedLoader,
} from "@/shared/loaderCompat";
import { createLoaderVersionFromManifest } from "@/shared/loaderVersions";
import {
  createInstallErrorResult,
  createInstallRuntimeOptions,
} from "./versionInstallOrchestration";
import {
  cancelActiveInstallOperation,
  isInstallOperationActive,
  tryBeginInstallOperation,
} from "./installLock";
import { setInstallActiveProbe } from "../windows/mainWindow";
import {
  LoaderBuild,
  changeLoaderVersion,
  readLoaderRollback,
} from "../game/loaderChange";
import { readInstanceLoaderRequirements } from "../utilities/loaderRequirements";
import { isVersionRunning } from "../utilities/worldBackups";
import { VersionsService } from "../services/Versions";

const fallbackVersionInit: IVersionClassData = {
  failed: true,
  hasManifest: false,
  launcherPath: "",
  minecraftPath: "",
  versionPath: "",
  javaPath: "",
  isQuickPlayMultiplayer: false,
  isQuickPlaySingleplayer: false,
};

const fallbackImport: IImportModpack = {
  type: "other",
  other: null as any,
};

const fallbackUploadMods: {
  mods: ILocalProject[];
  success: boolean;
  uploaded: number;
  failures: string[];
} = {
  mods: [],
  success: false,
  uploaded: 0,
  failures: [],
};

const fallbackInstall: VersionInstallResult = {
  success: false,
  error: "Installation failed.",
};

const fallbackLoaderChange: LoaderChangeResult = {
  success: false,
  error: "Loader change failed.",
};

const isPath = check.nonEmptyString(4096);
const isConf = check.object();
const isOptionalConf = check.optional(check.object());
const isDownloadItems = check.optional(check.arrayOf(check.object(), 100000));
const isLoaderVersionId = check.pattern(LOADER_VERSION_ID_PATTERN, 128);
const isModdedLoaderName = check.oneOf("forge", "neoforge", "fabric", "quilt");

export function isVersionInstallActive(): boolean {
  return isInstallOperationActive();
}

export async function runVersionInstallWithLock(
  account: ILocalAccount,
  settings: TSettings,
  versionConf: IVersionConf,
  extraItems?: DownloadItem[],
  options?: VersionInstallOptions,
): Promise<VersionInstallResult> {
  let vm: Version | null = null;

  const lock = tryBeginInstallOperation(() => vm?.cancelInstall());
  if (!lock) {
    return {
      success: false,
      error: "Another installation operation is already running.",
    };
  }

  resumeDownloads();

  try {
    vm = new Version(versionConf);
    await vm.init();
    await vm.install(
      settings,
      account,
      extraItems || [],
      createInstallRuntimeOptions(options, lock.controller.signal),
    );
    await vm.save();
    return { success: true };
  } catch (error) {
    const result = createInstallErrorResult(
      error,
      lock.controller.signal.aborted,
    );

    if (!result.cancelled) {
      console.error("[version:install] failed:", error);
    }

    return result;
  } finally {
    resumeDownloads();
    lock.end();
  }
}

async function resolveLoaderBuild(
  versionPath: string,
  versionConf: IVersionConf,
  targetId: string,
): Promise<LoaderBuild | null> {
  const rollback = await readLoaderRollback(versionPath, versionConf);
  if (rollback?.id === targetId) return rollback;

  const catalog = await VersionsService.getLoaderVersions(
    versionConf.loader.name,
    versionConf.version.id,
  ).catch((): LoaderVersion[] => []);
  const listed = catalog.find((item) => item.id === targetId);
  if (listed) return { id: listed.id, url: listed.url };

  return createLoaderVersionFromManifest(
    versionConf.loader.name,
    versionConf.version.id,
    targetId,
  );
}

export async function runLoaderChangeWithLock(
  account: ILocalAccount | undefined,
  settings: TSettings,
  versionConf: IVersionConf,
  targetId: string,
): Promise<LoaderChangeResult> {
  if (!account) {
    return {
      success: false,
      error: "An account is required to change the loader version.",
    };
  }

  if (!isModdedLoader(versionConf.loader?.name)) {
    return {
      success: false,
      error: "The instance has no mod loader to change.",
    };
  }

  let staged: Version | null = null;

  const lock = tryBeginInstallOperation(() => staged?.cancelInstall());
  if (!lock) {
    return {
      success: false,
      error: "Another installation operation is already running.",
    };
  }

  resumeDownloads();

  try {
    const live = new Version(versionConf);
    await live.init();

    if (isVersionRunning(live.versionPath)) {
      return { success: false, error: LOADER_CHANGE_RUNNING };
    }

    const build = await resolveLoaderBuild(
      live.versionPath,
      versionConf,
      targetId,
    );
    if (!build) return { success: false, error: LOADER_CHANGE_NOT_FOUND };

    const next = await changeLoaderVersion({
      versionPath: live.versionPath,
      conf: versionConf,
      build,
      settings,
      account,
      signal: lock.controller.signal,
      onStaged: (version) => {
        staged = version;
      },
    });

    return { success: true, loaderVersion: next.loader.version };
  } catch (error) {
    const result = createInstallErrorResult(
      error,
      lock.controller.signal.aborted,
    );

    if (!result.cancelled) {
      console.error("[version:changeLoader] failed:", error);
    }

    return result;
  } finally {
    resumeDownloads();
    lock.end();
  }
}

export function registerVersionIpc() {
  setInstallActiveProbe(isInstallOperationActive);

  handleSafe(
    "version:init",
    fallbackVersionInit,
    [isConf],
    async (_, versionConf: IVersionConf): Promise<IVersionClassData> => {
      const vm = new Version(versionConf);
      await vm.init();
      const rollback = await readLoaderRollback(vm.versionPath, versionConf);
      return {
        hasManifest: !!vm.manifest,
        javaMajorVersion: vm.manifest?.javaVersion?.majorVersion,
        launcherPath: vm.launcherPath,
        minecraftPath: vm.minecraftPath,
        versionPath: vm.versionPath,
        javaPath: vm.javaPath,
        isQuickPlayMultiplayer: vm.isQuickPlayMultiplayer,
        isQuickPlaySingleplayer: vm.isQuickPlaySingleplayer,
        loaderRollbackId: rollback?.id,
      };
    },
  );

  handleSafe(
    "version:install",
    fallbackInstall,
    [isOptionalConf, isConf, isConf, isDownloadItems, isOptionalConf],
    async (
      _,
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      extraItems?: DownloadItem[],
      options?: VersionInstallOptions,
    ): Promise<VersionInstallResult> =>
      runVersionInstallWithLock(
        account,
        settings,
        versionConf,
        extraItems,
        options,
      ),
  );

  handleSafe(
    "version:changeLoader",
    fallbackLoaderChange,
    [isOptionalConf, isConf, isConf, isLoaderVersionId],
    async (
      _,
      account: ILocalAccount | undefined,
      settings: TSettings,
      versionConf: IVersionConf,
      targetId: string,
    ): Promise<LoaderChangeResult> =>
      runLoaderChangeWithLock(account, settings, versionConf, targetId),
  );

  handleSafe<LoaderRequirementsScan | null>(
    "version:loaderRequirements",
    null,
    [isPath, isModdedLoaderName],
    async (_, versionPath: string, loader: string) => {
      assertReadablePath(versionPath, "version:loaderRequirements");
      return readInstanceLoaderRequirements(versionPath, loader);
    },
  );

  handleSafe("version:cancelInstall", false, async () => {
    return cancelActiveInstallOperation();
  });

  handleSafe("version:pauseInstall", false, async () => {
    if (!isInstallOperationActive()) return false;
    pauseDownloads();
    return true;
  });

  handleSafe("version:resumeInstall", false, async () => {
    if (!isInstallOperationActive()) return false;
    resumeDownloads();
    return true;
  });

  handleSafe<DownloadPauseState>("version:getPauseState", "off", async () => {
    if (!isInstallOperationActive()) return "off";
    return getDownloadPauseState();
  });

  handleSafe(
    "version:getRunCommand",
    null,
    [
      isOptionalConf,
      isConf,
      isConf,
      isOptionalConf,
      check.boolean(),
      isOptionalConf,
    ],
    async (
      _,
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      authData: IAuth | null,
      isRelative: boolean,
      quick?: { single?: string; multiplayer?: string },
    ) => {
      const vm = new Version(versionConf);
      await vm.init();
      return await vm.getRunCommand(
        account,
        settings,
        isRelative,
        authData,
        quick?.single,
        quick?.multiplayer,
      );
    },
  );

  handleSafe(
    "version:ensureAuthlib",
    { ok: false, reason: "unavailable" } as AuthlibEnsureResult,
    [isOptionalConf, isConf],
    async (
      _,
      account: ILocalAccount,
      versionConf: IVersionConf,
    ): Promise<AuthlibEnsureResult> => {
      const vm = new Version(versionConf);
      await vm.init();
      return await vm.ensureAuthlib(account);
    },
  );

  handleSafe(
    "version:run",
    false,
    [
      isOptionalConf,
      isConf,
      isConf,
      isOptionalConf,
      check.integer(),
      isOptionalConf,
    ],
    async (
      _,
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      authData: IAuth | null,
      instance: number,
      quick: { single?: string; multiplayer?: string },
    ) => {
      const vm = new Version(versionConf);
      await vm.init();
      return await vm.run(account, settings, authData, instance, quick);
    },
  );

  handleSafe<VersionDeleteResult | false>(
    "version:delete",
    false,
    [isOptionalConf, isConf, check.optional(check.boolean())],
    async (
      _,
      account: ILocalAccount,
      versionConf: IVersionConf,
      isFull: boolean,
    ) => {
      const lock = tryBeginInstallOperation(() => {});
      if (!lock) return { deleted: false, trashed: false, busy: true };

      try {
        const vm = new Version(versionConf);
        await vm.init();
        return await vm.delete(account, isFull);
      } finally {
        lock.end();
      }
    },
  );

  handleSafe(
    "version:save",
    false,
    [isConf],
    async (_, versionConf: IVersionConf) => {
      const vm = new Version(versionConf);
      await vm.init();
      await vm.save();
      return true;
    },
  );

  handleSafe(
    "version:import",
    fallbackImport,
    [isPath, isPath],
    async (event, filePath: string, tempPath: string) => {
      assertReadablePath(filePath, "version:import");
      assertWritablePath(tempPath, "version:import");
      const report = throttleProgress((progress: ArchiveExtractProgress) =>
        sendProgress(event.sender, "archive:extractProgress", progress),
      );
      return await importVersion(
        filePath,
        tempPath,
        (processedBytes, totalBytes) =>
          report({ archivePath: filePath, processedBytes, totalBytes }),
      );
    },
  );

  handleSafe(
    "share:uploadMods",
    fallbackUploadMods,
    [check.string(32768), isConf],
    async (_, at: string, versionConf: IVersionConf) => {
      const version = new Version(versionConf);
      await version.init();
      return uploadMods(at, version);
    },
  );
}
