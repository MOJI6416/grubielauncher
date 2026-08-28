import { ILocalFile, ProjectType, Provider, VersionReleaseType } from "./ModManager";

export const UPDATE_CHECK_MAX_ITEMS = 500;

export type UpdateCheckProvider = Provider.CURSEFORGE | Provider.MODRINTH;

export type UpdateCheckStatus =
  | "current"
  | "update"
  | "unavailable"
  | "unknown";

export interface IUpdateCheckItem {
  provider: UpdateCheckProvider;
  id: string;
  versionId?: string;
  hash?: string;
  projectType?: ProjectType;
}

export interface IUpdateCheckRequest {
  gameVersion: string;
  loader?: string;
  projectType?: ProjectType;
  items: IUpdateCheckItem[];
}

export interface IUpdateVersionDependency {
  projectId: string;
  versionId: string | null;
  relationType: string;
}

export interface IUpdateVersion {
  id: string;
  name: string;
  versionNumber?: string;
  dependencies: IUpdateVersionDependency[];
  downloads: number;
  releaseType?: VersionReleaseType;
  datePublished?: string;
  gameVersions?: string[];
  changelog?: string;
  files: ILocalFile[];
}

export interface IUpdateVerdict {
  provider: UpdateCheckProvider;
  id: string;
  status: UpdateCheckStatus;
  latest?: IUpdateVersion;
}

export interface IUpdateCheckResponse {
  generatedAt: string;
  items: IUpdateVerdict[];
}
