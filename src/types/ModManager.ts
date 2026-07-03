import { Loader } from "./Loader";

export interface ISearchData {
  projects: IProject[];
  limit: number;
  offset: number;
  total: number;
  error?: boolean;
}

export enum ProjectType {
  MOD = "mod",
  RESOURCEPACK = "resourcepack",
  SHADER = "shader",
  PLUGIN = "plugin",
  MODPACK = "modpack",
  WORLD = "world",
  DATAPACK = "datapack",
}

export enum Provider {
  CURSEFORGE = "curseforge",
  MODRINTH = "modrinth",
  LOCAL = "local",
  OTHER = "other",
}

export interface IProject {
  id: string;
  title: string;
  description: string;
  projectType: ProjectType;
  iconUrl: string | null;
  versions: IVersion[];
  provider: Provider;
  url: string;
  gallery: {
    title: string;
    url: string;
    description: string;
  }[];
  body: string;
  stats?: IProjectStats;
}

export interface IProjectStats {
  downloads?: number;
  follows?: number;
  dateCreated?: string;
  dateModified?: string;
}

export interface ILocalProject {
  title: string;
  description: string;
  projectType: ProjectType;
  iconUrl: string | null;
  url: string;
  provider: Provider;
  id: string;
  version: ILocalVersion | null;
}

export interface ILocalVersion {
  id: string;
  files: ILocalFile[];
  dependencies: ILocalDependency[];
}

export interface ILocalDependency {
  title: string;
  relationType: DependencyType;
}

export interface ILocalFile {
  filename: string;
  size: number;
  sha1: string;
  url: string;
  localPath?: string;
  isServer: boolean;
}

export interface IFilterGroup {
  title: string;
  items: IFilterItem[];
}

export interface IFilterItem {
  name: string;
  icon?: string;
  id?: string;
}

export interface ISelectedFilter {
  name: string;
  id?: string;
}

export interface IVersion {
  id: string;
  name: string;
  versionNumber?: string;
  dependencies: IVersionDependency[];
  downloads: number;
  files: ILocalFile[];
  releaseType?: VersionReleaseType;
  datePublished?: string;
  gameVersions?: string[];
  changelog?: string;
}

export type VersionReleaseType = "release" | "beta" | "alpha";

export interface IVersionDependency {
  projectId: string;
  versionId: string | null;
  project: IProject | null;
  relationType: DependencyType;
}

export enum DependencyType {
  REQUIRED = "required",
  OPTIONAL = "optional",
  INCOMPATIBLE = "incompatible",
  EMBEDDED = "embedded",
}

export interface IModpack {
  name: string;
  version: string;
  image: string | undefined;
  loader: Loader | undefined;
  loaderVersion?: string;
  folderPath: string;
  mods: ILocalProject[];
  versionId?: string;
}

export interface IModPackFile {
  url: string;
  filename: string;
  size: number;
  type: ProjectType;
  isServer: boolean;
  sha1: string;
}

export interface ILocalFileInfo {
  name: string;
  version: string | null;
  description: string;
  url: string;
  filename: string;
  size: number;
  path: string;
  id: string;
  sha1: string;
  icon: string | null;
}

export interface IFabricMod {
  id: string;
  version: string;
  name: string;
  description: string;
  contact: {
    homepage: string;
  };
  icon?: string;
}

export interface IAddedLocalProject {
  project: IProject;
  status: "valid" | "duplicate" | "invalid";
}

export interface IUpdateProject {
  project: ILocalProject;
  version: IVersion;
}
