import { IVersionConf } from '@/types/IVersion'
import { IServerConf } from '@/types/Server'
import { TSettings } from '@/types/Settings'
import {
  VERSION_INSTALL_CANCELLED,
  VersionInstallOptions,
  VersionInstallResult,
} from '@/types/InstallationProgress'

const api = window.api

export class Mods {
  private versionConf: IVersionConf
  private server?: IServerConf
  private settings: TSettings

  constructor(settings: TSettings, versionConf: IVersionConf, server?: IServerConf) {
    this.settings = settings
    this.versionConf = versionConf
    this.server = server
  }

  private handleResult(result: VersionInstallResult | boolean | undefined) {
    if (typeof result === 'boolean') {
      if (!result) throw new Error('Mods operation failed.')
      return
    }

    if (!result?.success) {
      if (result?.cancelled) throw new Error(VERSION_INSTALL_CANCELLED)
      throw new Error(result?.error || 'Mods operation failed.')
    }
  }

  async check(options?: VersionInstallOptions) {
    const result = await api.mods.check(
      this.settings,
      this.versionConf,
      this.server,
      options
    )
    this.handleResult(result)
  }

  async downloadOther(options?: VersionInstallOptions) {
    const result = await api.mods.downloadOther(
      this.settings,
      this.versionConf,
      options
    )
    this.handleResult(result)
  }
}
