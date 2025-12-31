import { IVersionConf } from '@/types/IVersion'
import { IServerConf } from '@/types/Server'
import { TSettings } from '@/types/Settings'

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

  async check() {
    await api.mods.check(this.settings, this.versionConf, this.server)
  }

  async downloadOther() {
    await api.mods.downloadOther(this.settings, this.versionConf)
  }
}
