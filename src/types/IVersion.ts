import { IModpack } from './ModManager'
import { IArguments } from './IArguments'
import { ILoader } from './Loader'
import { IServer } from './ServersList'
import { InstanceSettingsOverrides } from '../shared/instanceSettings'
import type { IModpackSource } from './ModpackSource'

export interface IVersion {
  id: string
  type: string
  url: string
  serverManager: boolean
}

export interface IJarMod {
  file: string
  name: string
  enabled: boolean
  url?: string
  sha1?: string
  size?: number
}

export interface IJarModSet {
  mods: IJarMod[]
  main: IJarMod | null
}

export interface IVersionConf {
  name: string
  description?: string
  loader: ILoader
  version: IVersion
  owner?: string
  ownerId?: string
  lastLaunch?: Date
  build: number
  shareCode?: string
  downloadedVersion: boolean
  lastUpdate: Date
  runArguments: IArguments
  image: string
  quickServer?: string
  overrides?: InstanceSettingsOverrides
  jarMods?: IJarMod[]
  mainJar?: IJarMod
  modpack?: IModpackSource
}

export interface VersionDeleteResult {
  deleted: boolean
  trashed: boolean
  busy?: boolean
}

export const VERSION_DELETE_BUSY = 'versionDeleteBusy'

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

export interface IVersionClassData {
  failed?: boolean
  hasManifest: boolean
  javaMajorVersion?: number
  launcherPath: string
  minecraftPath: string
  versionPath: string
  javaPath: string
  isQuickPlayMultiplayer: boolean
  isQuickPlaySingleplayer: boolean
  loaderRollbackId?: string
}
