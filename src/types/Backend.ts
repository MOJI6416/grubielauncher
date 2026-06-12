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
  isPublic?: boolean
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
  isPublic?: boolean | null
}

export type UploadFileProgressStatus =
  | 'preparing'
  | 'uploading'
  | 'completed'
  | 'error'

export interface UploadFileProgress {
  id: string
  status: UploadFileProgressStatus
  loaded: number
  total: number
  percent: number
  statusCode?: number
  message?: string
}

export interface DirectUploadStartResponse {
  object_key: string
  upload_url: string
  file_url: string
  expires_in: number
  headers: Record<string, string>
}

export interface DirectUploadCompleteResponse {
  object_key: string
  file_url: string
  size: number
  content_type?: string
}
