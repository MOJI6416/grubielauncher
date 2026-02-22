import { IAuth, ILocalAccount } from "@/types/Account";
import { DownloadItem } from "@/types/Downloader";
import { IVersionConf } from "@/types/IVersion";
import { IVersionManifest } from "@/types/IVersionManifest";
import { TSettings } from "@/types/Settings";

const api = window.api;

export class Version {
  public version: IVersionConf;
  public manifest: IVersionManifest | undefined;

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
    this.javaPath = res.javaPath;
    this.versionPath = res.versionPath;
    this.minecraftPath = res.minecraftPath;
    this.launcherPath = res.launcherPath;
    this.isQuickPlayMultiplayer = res.isQuickPlayMultiplayer;
    this.isQuickPlaySingleplayer = res.isQuickPlaySingleplayer;
    this.manifest = res.manifest;
  }

  async install(
    account: ILocalAccount,
    settings: TSettings,
    items: DownloadItem[] = [],
  ) {
    await api.version.install(account, settings, this.version, items);
  }

  async getRunCommand(
    account: ILocalAccount,
    settings: TSettings,
    authData: IAuth | null,
    isRelative = false,
    quickSingle?: string,
    quickMultiplayer?: string,
  ) {
    return await api.version.getRunCommand(
      account,
      settings,
      this.version,
      authData,
      isRelative,
      { single: quickSingle, multiplayer: quickMultiplayer },
    );
  }

  async run(
    account: ILocalAccount,
    settings: TSettings,
    authData: IAuth | null,
    instance: number,
    quick: { single?: string; multiplayer?: string } = {},
  ) {
    await api.version.run(
      account,
      settings,
      this.version,
      authData,
      instance,
      quick,
    );
  }

  async delete(account: ILocalAccount, isFull = false) {
    await api.version.delete(account, this.version, isFull);
  }

  async save() {
    await api.version.save(this.version);
  }
}
