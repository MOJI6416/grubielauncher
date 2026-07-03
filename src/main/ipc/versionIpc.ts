import { IAuth, ILocalAccount } from "@/types/Account";
import { AuthlibEnsureResult } from "@/types/IAuthlib";
import {
  IImportModpack,
  IVersionClassData,
  IVersionConf,
} from "@/types/IVersion";
import { TSettings } from "@/types/Settings";
import { Version } from "../game/Version";
import { DownloadItem } from "@/types/Downloader";
import { importVersion } from "../utilities/versions";
import { uploadMods } from "../utilities/share";
import { handleSafe } from "../utilities/ipc";
import { pauseDownloads, resumeDownloads } from "../utilities/downloader";
import { ILocalProject } from "@/types/ModManager";
import {
  VersionInstallOptions,
  VersionInstallResult,
} from "@/types/InstallationProgress";
import {
  createInstallErrorResult,
  createInstallRuntimeOptions,
} from "./versionInstallOrchestration";
import {
  cancelActiveInstallOperation,
  isInstallOperationActive,
  tryBeginInstallOperation,
} from "./installLock";

const fallbackVersionInit: IVersionClassData = {
  version: {} as IVersionConf,
  launcherPath: "",
  minecraftPath: "",
  versionPath: "",
  javaPath: "",
  isQuickPlayMultiplayer: false,
  isQuickPlaySingleplayer: false,
  manifest: undefined,
};

const fallbackImport: IImportModpack = {
  type: "other",
  other: null as any,
};

const fallbackUploadMods: {
  mods: ILocalProject[];
  success: boolean;
  uploaded: number;
} = {
  mods: [],
  success: false,
  uploaded: 0,
};

const fallbackInstall: VersionInstallResult = {
  success: false,
  error: "Installation failed.",
};

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
    lock.end();
  }
}

export function registerVersionIpc() {
  handleSafe(
    "version:init",
    fallbackVersionInit,
    async (_, versionConf: IVersionConf): Promise<IVersionClassData> => {
      const vm = new Version(versionConf);
      await vm.init();
      return {
        version: vm.version,
        launcherPath: vm.launcherPath,
        minecraftPath: vm.minecraftPath,
        versionPath: vm.versionPath,
        javaPath: vm.javaPath,
        isQuickPlayMultiplayer: vm.isQuickPlayMultiplayer,
        isQuickPlaySingleplayer: vm.isQuickPlaySingleplayer,
        manifest: vm.manifest,
      };
    },
  );

  handleSafe(
    "version:install",
    fallbackInstall,
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

  handleSafe(
    "version:getRunCommand",
    null,
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

  handleSafe(
    "version:delete",
    false,
    async (
      _,
      account: ILocalAccount,
      versionConf: IVersionConf,
      isFull: boolean,
    ) => {
      const vm = new Version(versionConf);
      await vm.init();
      await vm.delete(account, isFull);
      return true;
    },
  );

  handleSafe("version:save", false, async (_, versionConf: IVersionConf) => {
    const vm = new Version(versionConf);
    await vm.init();
    await vm.save();
    return true;
  });

  handleSafe(
    "version:import",
    fallbackImport,
    async (_, filePath: string, tempPath: string) => {
      const version = await importVersion(filePath, tempPath);
      return version;
    },
  );

  handleSafe(
    "share:uploadMods",
    fallbackUploadMods,
    async (_, at: string, versionConf: IVersionConf) => {
      const version = new Version(versionConf);
      await version.init();
      return uploadMods(at, version);
    },
  );
}
