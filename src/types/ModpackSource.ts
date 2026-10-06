import type { IVersionConf } from "./IVersion";
import type {
  IModpackExtraFile,
  Provider,
  VersionReleaseType,
} from "./ModManager";

export type ModpackSourceProvider = Provider.MODRINTH | Provider.CURSEFORGE;

export interface IModpackSource {
  provider: ModpackSourceProvider;
  projectId: string;
  versionId: string;
  versionNumber: string;
  title: string;
  url: string;
  publishedAt?: string;
  releaseType?: VersionReleaseType;
}

export interface ModpackBaseProject {
  key: string;
  versionId: string;
  files: string[];
}

export type ModpackFileSide = "client" | "server";

export type ModpackFileMap = Record<string, string>;

export interface ModpackBase {
  versionId: string;
  loaderVersion?: string;
  projects: ModpackBaseProject[];
  client: ModpackFileMap;
  server: ModpackFileMap;
}

export interface ModpackBaseInput {
  versionId: string;
  loaderVersion?: string;
  projects: ModpackBaseProject[];
  extraFiles: IModpackExtraFile[];
}

export interface ModpackFileTarget {
  side: ModpackFileSide;
  path: string;
}

export interface ModpackFilesPlan {
  write: ModpackFileTarget[];
  conflicts: ModpackFileTarget[];
  remove: ModpackFileTarget[];
  kept: ModpackFileTarget[];
  protected: ModpackFileTarget[];
}

export interface ModpackApplyResult {
  downloads: { url: string; destination: string }[];
}

export interface ModpackRollbackInfo {
  fromVersion: string;
  toVersion: string;
  createdAt: string;
}

export interface ModpackRollback {
  conf: IVersionConf;
}
