export interface ISkinsConfig {
  skins: ISkinEntry[]
}

export interface ISkinEntry {
  hash: string
  capeId?: string
  remoteId?: string
  model: 'slim' | 'classic'
  name: string
  id: string
  url: string
  character?: string
}

export interface SkinsData {
  skins: ISkinsConfig
  capes: ICape[]
  selectedSkin: string | null
  activeSkin: string | undefined
  activeCape: string | undefined
  activeModel: string | undefined
}

export interface IGrubieSkin {
  _id: string
  skinUrl: string
  model: 'slim' | 'classic'
  capeUrl?: string
}

export interface IMojangProfile {
  id: string
  name: string
  skins: {
    id: string
    state: string
    url: string
    variant: 'SLIM' | 'CLASSIC'
  }[]
  capes: {
    id: string
    state: string
    url: string
    alias: string
  }[]
}

export interface ICape {
  id: string
  hash: string
  remoteId?: string
  alias: string
  url: string
  cape: string
}

export type CatalogSkinSource = 'official' | 'community'
export type CatalogSkinStatus = 'approved' | 'pending' | 'rejected'
export type CatalogItemType = 'skin' | 'cape' | 'pack'

export interface ICatalogSkin {
  id: string
  type: CatalogItemType
  name: string
  model: 'slim' | 'classic'
  tags: string[]
  source: CatalogSkinSource
  authorName: string | null
  skinUrl: string | null
  capeUrl?: string | null
  previewUrl?: string | null
  status?: CatalogSkinStatus
  rejectionReason?: string | null
  downloads?: number
}

export interface MyCommunityResult {
  items: ICatalogSkin[]
}

export interface CatalogListResult {
  items: ICatalogSkin[]
  total: number
  page: number
  pageSize: number
}

export interface CatalogListParams {
  search?: string
  tag?: string
  source?: CatalogSkinSource
  type?: CatalogItemType
  sort?: CatalogSortOption
  page?: number
  limit?: number
}

export type CatalogSortOption = 'new' | 'downloads'

export interface PublishCommunityResult {
  ok: boolean
  status?: 'pending' | 'approved'
  error?: 'duplicate' | 'limit' | 'no_manager' | 'failed'
  reason?: string | null
  dupStatus?: CatalogSkinStatus
}
