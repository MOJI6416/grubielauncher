import { ILocalAccount } from '@/types/Account'
import { IVersionConf } from '@/types/IVersion'
import { IServerConf } from '@/types/Server'

const api = window.api

export class ServerGame {
  private account?: ILocalAccount
  private downloadLimit: number
  private versionPath: string
  private serverPath: string
  private conf: IServerConf
  private versionConf?: IVersionConf

  constructor(
    account: ILocalAccount | undefined,
    downloadLimit: number,
    versionPath: string,
    serverPath: string,
    conf: IServerConf,
    versionConf?: IVersionConf
  ) {
    this.account = account
    this.downloadLimit = downloadLimit
    this.versionPath = versionPath
    this.serverPath = serverPath
    this.conf = conf
    this.versionConf = versionConf
  }

  async install() {
    await api.server.install(
      this.account,
      this.downloadLimit,
      this.versionPath,
      this.serverPath,
      this.conf,
      this.versionConf
    )
  }
}
