import { IAuth, ILocalAccount } from "@/types/Account";
import { DownloadItem } from "@/types/Downloader";
import {
  VERSION_INSTALL_CANCELLED,
  VersionInstallOptions,
  VersionInstallResult,
} from "@/types/InstallationProgress";
import { IVersionConf, VERSION_DELETE_BUSY } from "@/types/IVersion";
import { TSettings } from "@/types/Settings";
import { installQueue } from "@renderer/features/install/installQueue";

const api = window.api;

export class Version {
  public version: IVersionConf;
  public hasManifest: boolean = false;
  public javaMajorVersion: number | undefined;

  public launcherPath: string = "";
  public minecraftPath: string = "";
  public versionPath: string = "";
  public javaPath: string = "";
  public isQuickPlayMultiplayer: boolean = false;
  public isQuickPlaySingleplayer: boolean = false;

  constructor(version: IVersionConf) {
    this.version = version;
  }

  async init() {
    const res = await api.version.init(this.version);
    if (!res || res.failed) {
      throw new Error(`Failed to open instance ${this.version.name}`);
    }
    this.javaPath = res.javaPath;
    this.versionPath = res.versionPath;
    this.minecraftPath = res.minecraftPath;
    this.launcherPath = res.launcherPath;
    this.isQuickPlayMultiplayer = res.isQuickPlayMultiplayer;
    this.isQuickPlaySingleplayer = res.isQuickPlaySingleplayer;
    this.hasManifest = res.hasManifest;
    this.javaMajorVersion = res.javaMajorVersion;
  }

  async install(
    account: ILocalAccount,
    settings: TSettings,
    items: DownloadItem[] = [],
    options?: VersionInstallOptions,
    queueSignal?: AbortSignal,
  ) {
    const result = await installQueue.run(
      {
        id: installQueue.nextId("version"),
        label: this.version.name,
        loaderName: this.version.loader.name,
      },
      async () =>
        (await api.version.install(
          account,
          settings,
          this.version,
          items,
          options,
        )) as VersionInstallResult | boolean | undefined,
      queueSignal,
    );

    if (typeof result === "boolean") {
      if (!result) {
        throw new Error(`Failed to install version ${this.version.name}`);
      }
      await this.init();
      return;
    }

    if (!result?.success) {
      if (result?.cancelled) {
        throw new Error(VERSION_INSTALL_CANCELLED);
      }

      throw new Error(
        result?.error || `Failed to install version ${this.version.name}`,
      );
    }

    await this.init();
  }

  async ensureAuthlib(account: ILocalAccount) {
    return await api.version.ensureAuthlib(account, this.version);
  }

  async run(
    account: ILocalAccount,
    settings: TSettings,
    authData: IAuth | null,
    instance: number,
    quick: { single?: string; multiplayer?: string } = {},
  ) {
    return await api.version.run(
      account,
      settings,
      this.version,
      authData,
      instance,
      quick,
    );
  }

  async delete(account: ILocalAccount, isFull = false) {
    const result = await api.version.delete(account, this.version, isFull);

    if (!result || !result.deleted) {
      throw new Error(
        result && result.busy
          ? VERSION_DELETE_BUSY
          : `Failed to delete version ${this.version.name}`,
      );
    }

    return result;
  }

  async save() {
    return (await api.version.save(this.version)) !== false;
  }
}
