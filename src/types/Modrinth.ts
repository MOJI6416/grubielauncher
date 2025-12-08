export interface IProject {
  slug: string
  title: string
  description: string
  categories: string[]
  client_side: SideSupport
  server_side: SideSupport
  body: string
  status: ProjectStatus
  requested_status: ProjectRequestedStatus | null
  additional_categories: string[]
  issues_url: string | null
  source_url: string | null
  wiki_url: string | null
  discord_url: string | null
  donation_urls: ProjectDonationURL[]
  project_type: ProjectType
  downloads: number
  icon_url: string | null
  color: number | null
  thread_id: string
  monetization_status: MonetizationStatus
  id: string
  team: string
  published: string
  updated: string
  approved: string | null
  queued: string | null
  followers: number
  license: ProjectLicense
  versions: string[]
  objectVersions?: IVersion[]
  game_versions: string[]
  loaders: string[]
  gallery: GalleryImage[] | null
}

export interface IResult {
  hits: IResultProject[]
  offset: number
  limit: number
  total_hits: number
}

export interface IResultProject {
  slug: string
  title: string
  description: string
  categories: string[]
  client_side: SideSupport
  server_side: SideSupport
  project_type: ProjectType
  downloads: number
  icon_url: string | null
  color: number | null
  thread_id: string
  monetization_status: MonetizationStatus
  project_id: string
  author: string
  display_categories: string[]
  versions: string[]
  follows: number
  date_created: string
  date_modified: string
  latest_version: string
  license: string
  gallery: string[]
  featured_gallery: string[] | null
}

type SideSupport = 'required' | 'optional' | 'unsupported'

type ProjectStatus =
  | 'approved'
  | 'archived'
  | 'rejected'
  | 'draft'
  | 'unlisted'
  | 'processing'
  | 'withheld'
  | 'scheduled'
  | 'private'
  | 'unknown'

type ProjectRequestedStatus = 'approved' | 'archived' | 'unlisted' | 'private' | 'draft'

interface ProjectDonationURL {
  id: string
  platform: string
  url: string
}

export enum ProjectType {
  MOD = 'mod',
  MODPACK = 'modpack',
  RESOURCEPACK = 'resourcepack',
  SHADER = 'shader',
  PLUGIN = 'plugin',
  WORLD = 'world',
  DATAPACK = 'datapack'
}
export const ProjectTypes = ['mod', 'modpack', 'resourcepack', 'shader']

type MonetizationStatus = 'monetized' | 'demonetized' | 'force-demonetized'

interface ProjectLicense {
  id: string
  name: string
  url: string | null
}

export interface GalleryImage {
  url: string
  raw_url: string | null
  featured: boolean
  title: string | null
  description: string | null
  created: string
  ordering: number
}

export interface IVersion {
  name: string
  version_number: string
  changelog: string | null
  dependencies: VersionDependency[]
  game_versions: string[]
  version_type: VersionType
  loaders: string[]
  featured: boolean
  status: VersionStatus
  requested_status: VersionRequestedStatus | null
  id: string
  project_id: string
  author_id: string
  date_published: string
  downloads: number
  isServer: boolean
  files: VersionFile[]
}

export interface VersionDependency {
  version_id: string | null
  project_id: string | null
  file_name: string | null
  dependency_type: DependencyType
}

export type DependencyType = 'required' | 'optional' | 'incompatible' | 'embedded'

export type VersionType = 'release' | 'beta' | 'alpha'

export type VersionStatus = 'listed' | 'archived' | 'draft' | 'unlisted' | 'scheduled' | 'unknown'

export type VersionRequestedStatus = 'listed' | 'archived' | 'draft' | 'unlisted'

export interface VersionFileHashes {
  sha512: string
  sha1: string
}

export interface VersionFile {
  hashes: VersionFileHashes
  url: string
  filename: string
  primary: boolean
  size: number
  file_type: FileType | null
}

export type FileType = 'required-resource-pack' | 'optional-resource-pack'

export interface ITag {
  icon: string
  name: string
}

export interface ICategoryTag {
  icon: string
  name: string
  project_type: ProjectType
  header: string
}

export interface ILoaderTag {
  icon: string
  name: string
  supported_project_types: string[]
}

export enum SortValue {
  Relevance = 'relevance',
  Downloads = 'downloads',
  Follows = 'follows',
  Newest = 'newest',
  Updated = 'updated'
}
export const SortValues = ['relevance', 'downloads', 'follows', 'newest', 'updated']

export interface IProjectDependencies {
  projects: IProject[]
  versions: IVersion[]
}

export interface IModpack {
  game: string
  formatVersion: number
  versionId: string
  name: string
  summary: string | null
  files: IModpackFile[]
  dependencies: IModpackDependencies[]
}

export interface IModpackDependencies {
  [key: string]: string
}

export interface IModpackFile {
  path: string
  hashes: VersionFileHashes
  env?: {
    server: SideSupport
    client: SideSupport
  }
  downloads: string[]
  fileSize: number
}
