import { IServer as ILocalServer } from './ServersList'
import { ILocalProject } from './ModManager'
import { IArguments } from './IArguments'
import { ILoader } from './Loader'
import { IUser } from './IUser'

export interface IModpack {
  readonly _id: string
  // The link that gets handed out and the key an instance is matched by.
  // `_id` is the database row id: builds published before share codes existed
  // have none, everything since has one, and the backend refuses id access to
  // an unlisted build.
  readonly shareCode?: string | null
  build: number
  conf: IModpackConf
  // GET /modpacks/own does not populate this — it is the caller's own list.
  owner?: IUser
  lastUpdate: Date
  createdAt: Date
  downloads: number
  isPublic?: boolean
}

export interface IModpackCard {
  id: string
  name: string
  description: string
  imageUrl: string
  downloads: number
  build: number
  createdAt: string
  lastUpdate: string
  minecraftVersion: string
  loader: { name: string; version: string }
  owner: { nickname: string; imageUrl: string }
  summary: { mods: number; servers: number; otherFiles: number }
}

export interface IExploreFacets {
  loaders: { name: string; count: number }[]
  minecraftVersions: { version: string; count: number }[]
}

export type ExploreSort = 'downloads' | 'updated' | 'new'

export interface IExploreQuery {
  offset?: number
  limit?: number
  sort?: ExploreSort
  q?: string
  loader?: string
  mc?: string
}

export interface IExplorePage {
  total: number
  offset: number
  limit: number
  facets: IExploreFacets
  items: IModpackCard[]
}

export interface IModpackConf {
  name: string
  description?: string
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
  description?: string | null
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
