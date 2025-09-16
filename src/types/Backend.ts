import { IServer as ILocalServer } from './ServersList'
import { ILocalProject } from './ModManager'
import { IArguments } from './IArguments'
import { IServer } from './Browser'
import { ILoader } from './Loader'
import { IUser } from './IUser'

export interface IModpack {
  readonly _id: string
  build: number
  conf: IModpackConf
  owner: string | IUser
  lastUpdate: Date
  createdAt: Date
  public: boolean
  description: string
  downloads: number
  tags: string[]
}

export interface IModpackConf {
  name: string
  loader: ILoader
  version: IModpackVersion
  servers: ILocalServer[]
  options: string
  runArguments: IArguments
  image: string
  quickServer: string
}

export interface IModpackVersion {
  id: string
  type: string
  url: string
  isNew?: boolean
  serverManager: boolean
}

export interface IModpackUpdate {
  build: number
  name: string | null
  mods: ILocalProject[] | null
  servers: ILocalServer[] | null
  options: string | null
  runArguments: IArguments | null
  other: ILoader['other'] | null
  public: boolean | null
  image: string | null
  description: string | null
  tags: string[] | null
  quickServer: string | null
}

export interface IBackendServer extends IServer {
  status: IServerStatus | null
}

export interface IServerStatus {
  online: boolean
  host: string
  port: number
  ip_address: string
  eula_blocked: boolean
  retrieved_at: Number
  expires_at: Number
  version: {
    name_raw: string
    name_clean: string
    name_html: string
    protocol: number
  }
  players: {
    online: number
    max: number
    list: {
      uuid: string
      name_raw: string
      name_clean: string
      name_html: string
    }[]
  }
  motd: {
    raw: string
    clean: string
    html: string
  }
  icon: string
  mods: {
    name: string
    version: string
  }[]
  software: string
  plugins: {
    name: string
    version: string
  }[]
  srv_record: {
    host: string
    port: number
  }
}
