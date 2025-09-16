import { IModpack } from './ModManager'
import { IArguments } from './IArguments'
import { ILoader } from './Loader'
import { IServer } from './ServersList'

export interface IVersion {
  id: string
  type: string
  url: string
  serverManager: boolean
}

export interface IVersionConf {
  name: string
  loader: ILoader
  version: IVersion
  owner?: string
  lastLaunch: Date
  build: number
  shareCode?: string
  downloadedVersion: boolean
  lastUpdate: Date
  runArguments: IArguments
  image: string
  quickServer?: string
}

export interface IModpackFile {
  path: string
  conf: IVersionConf
  servers: IServer[]
  options: string
}

export interface IImportModpack {
  type: 'gl' | 'other'
  gl?: IModpackFile
  other?: IModpack
}
