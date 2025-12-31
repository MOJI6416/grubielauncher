import { IAuth, ILocalAccount } from '@/types/Account'
import { DownloadItem } from '@/types/Downloader'
import { IVersionConf } from '@/types/IVersion'
import { IVersionManifest } from '@/types/IVersionManifest'
import { TSettings } from '@/types/Settings'

const api = window.api

export class Version {
  public version: IVersionConf
  public manifest: IVersionManifest | undefined

  private settings: TSettings
  public launcherPath: string = ''
  public minecraftPath: string = ''
  public versionPath: string = ''
  public javaPath: string = ''
  public isQuickPlayMultiplayer: boolean = false
  public isQuickPlaySingleplayer: boolean = false

  constructor(settings: TSettings, version: IVersionConf) {
    this.settings = settings
    this.version = version
  }

  async init() {
    const res = await api.version.init(this.settings, this.version)
    this.javaPath = res.javaPath
    this.versionPath = res.versionPath
    this.minecraftPath = res.minecraftPath
    this.launcherPath = res.launcherPath
    this.isQuickPlayMultiplayer = res.isQuickPlayMultiplayer
    this.isQuickPlaySingleplayer = res.isQuickPlaySingleplayer
    this.manifest = res.manifest
  }

  async install(account: ILocalAccount, items: DownloadItem[] = []) {
    await api.version.install(this.settings, this.version, account, items)
  }

  async getRunCommand(
    account: ILocalAccount,
    authData: IAuth | null,
    isRelative = false,
    quickSingle?: string,
    quickMultiplayer?: string
  ) {
    return await api.version.getRunCommand(
      this.settings,
      this.version,
      account,
      authData,
      isRelative,
      { single: quickSingle, multiplayer: quickMultiplayer }
    )
  }

  async run(
    account: ILocalAccount,
    authData: IAuth | null,
    instance: number,
    quick: { single?: string; multiplayer?: string } = {}
  ) {
    await api.version.run(this.settings, this.version, account, authData, instance, quick)
  }

  async delete(isFull = false) {
    await api.version.delete(this.version, isFull)
  }

  async save() {
    await api.version.save(this.settings, this.version)
  }
}
