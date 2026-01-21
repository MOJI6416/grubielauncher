import { IServer as ILocalServer } from './ServersList'
import { ILocalProject } from './ModManager'
import { IArguments } from './IArguments'
import { ILoader } from './Loader'
import { IUser } from './IUser'

export interface IModpack {
  readonly _id: string
  build: number
  conf: IModpackConf
  owner: IUser
  lastUpdate: Date
  createdAt: Date
  downloads: number
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
  image: string | null
  quickServer: string | null
}
