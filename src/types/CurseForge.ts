export interface IMod {
  id: number
  gameId: number
  name: string
  slug: string
  links: ILinks
  summary: string
  status: ModStatus
  downloadCount: number
  isFeatured: boolean
  primaryCategoryId: number
  categories: ICategory[]
  classId: number | null
  authors: IModAuthor[]
  logo: IModAsset
  screenshots: IModAsset[]
  mainFileId: number
  latestFiles: IFile[]
  latestFilesIndexes: IFileIndex[]
  latestEarlyAccessFilesIndexes: IFileIndex[]
  dateCreated: string
  dateModified: string
  dateReleased: string
  allowModDistribution: boolean | null
  gamePopularityRank: number
  isAvailable: boolean
  thumbsUpCount: number
  rating: number | null
}

export interface ILinks {
  websiteUrl: string
  wikiUrl: string
  issuesUrl: string
  sourceUrl: string
}

export enum ModStatus {
  'New' = 1,
  'ChangesRequired' = 2,
  'UnderSoftReview' = 3,
  'Approved' = 4,
  'Rejected' = 5,
  'ChangesMade' = 6,
  'Inactive' = 7,
  'Abandoned' = 8,
  'Deleted' = 9,
  'UnderReview' = 10
}

export interface ICategory {
  id: number
  gameId: number
  name: string
  slug: string
  url: string
  iconUrl: string
  dateModified: string
  isClass: boolean | null
  classId: boolean | null
  parentCategoryId: number | null
  displayIndex: number | null
}

export interface IModAuthor {
  id: number
  name: string
  url: string
}

export interface IModAsset {
  id: number
  modId: number
  title: string
  description: string
  thumbnailUrl: string
  url: string
}

export interface IFile {
  id: number
  gameId: number
  modId: number
  isAvailable: boolean
  displayName: string
  fileName: string
  hashes: IFileHash[]
  fileDate: string
  fileLength: number
  downloadCount: number
  fileSizeOnDisk: number | null
  downloadUrl: string | null
  gameVersions: string[]
  sortableGameVersions: ISortableGameVersion[]
  dependencies: IFileDependency[]
  exposeAsAlternative: boolean | null
  parentProjectFileId: number | null
  alternateFileId: number | null
  isServerPack: boolean | null
  serverPackFileId: number | null
  isEarlyAccessContent: boolean | null
  earlyAccessEndDate: string | null
  fileFingerprint: string
  modules: IFileModule[]
}

export enum HashAlgo {
  'Sha1' = 1,
  'Md5' = 2
}

export interface IFileHash {
  value: string
  algo: HashAlgo
}

export interface ISortableGameVersion {
  gameVersionName: string
  gameVersionPadded: string
  gameVersion: string
  gameVersionReleaseDate: string
  gameVersionTypeId: number | null
}

export interface IFileDependency {
  modId: number
  relationType: FileRelationType
}

export enum FileRelationType {
  'EmbeddedLibrary' = 1,
  'OptionalDependency' = 2,
  'RequiredDependency' = 3,
  'Tool' = 4,
  'Incompatible' = 5,
  'Include' = 6
}

export interface IFileModule {
  name: string
  fingerprint: string
}

export interface IFileIndex {
  gameVersion: string
  fileId: number
  filename: string
  realeaseType: FileReleaseType
  gameVersionTypeId: number | null
  modLoader: ModLoaderType
}

export enum FileReleaseType {
  'Release' = 1,
  'Beta' = 2,
  'Alpha' = 3
}

export enum ModLoaderType {
  'Any' = 0,
  'Forge' = 1,
  'Cauldron' = 2,
  'LiteLoader' = 3,
  'Fabric' = 4,
  'Quilt' = 5,
  'NeoForge' = 6
}

export type ModType = 'mod' | 'resourcepack' | 'shader' | 'modpack'

export enum ModTypeClassIds {
  'mod' = 6,
  'resourcepack' = 12,
  'shader' = 6552,
  'modpack' = 4471,
  'plugin' = 5,
  'world' = 17,
  'datapack' = 6945
}

export enum ModsSearchSortField {
  'Featured' = 1,
  'Popularity' = 2,
  'LastUpdated' = 3,
  'TotalDownloads' = 6,
  'ReleaseDate' = 11
}

export interface ISearchModsResponse {
  data: IMod[]
  pagination: IPagination
}

export interface IPagination {
  index: number
  pageSize: number
  resultCount: number
  totalCount: number
}

export interface IGetModFilesResponse {
  data: IFile[]
  pagination: IPagination
}

export interface GetModsByIdsListRequestBody {
  modIds: number[]
  filterPcOnly: boolean | null
}

export interface IModpack {
  minecraft: {
    version: string
    modLoaders: { id: string; primary: boolean }[]
  }
  manifestType: string
  manifestVersion: number
  name: string
  version: string
  author: string
  files: IModPackFile[]
}

export interface IModPackFile {
  projectID: number
  fileID: number
  required: boolean
}
