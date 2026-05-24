import { IAuth, ILocalAccount } from "@/types/Account";
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
import { ILocalProject } from "@/types/ModManager";
import {
  VersionInstallOptions,
  VersionInstallResult,
} from "@/types/InstallationProgress";
import {
  createInstallErrorResult,
  createInstallRuntimeOptions,
} from "./versionInstallOrchestration";

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

let activeInstall: {
  controller: AbortController;
  version: Version;
} | null = null;

export async function runVersionInstallWithLock(
  account: ILocalAccount,
  settings: TSettings,
  versionConf: IVersionConf,
  extraItems?: DownloadItem[],
  options?: VersionInstallOptions,
): Promise<VersionInstallResult> {
  if (activeInstall) {
    return {
      success: false,
      error: "Another version installation is already running.",
    };
  }

  const controller = new AbortController();
  let vm: Version | null = null;

  try {
    vm = new Version(versionConf);
    activeInstall = { controller, version: vm };
    await vm.init();
    await vm.install(
      settings,
      account,
      extraItems || [],
      createInstallRuntimeOptions(options, controller.signal),
    );
    await vm.save();
    return { success: true };
  } catch (error) {
    const result = createInstallErrorResult(error, controller.signal.aborted);

    if (!result.cancelled) {
      console.error("[version:install] failed:", error);
    }

    return result;
  } finally {
    if (activeInstall?.controller === controller) {
      activeInstall = null;
    }
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
    if (!activeInstall) return false;

    activeInstall.controller.abort();
    activeInstall.version.cancelInstall();
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
