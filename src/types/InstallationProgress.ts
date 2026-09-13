import { DownloaderFailureItem } from "./Downloader";
import { Loader } from "./Loader";

export const VERSION_INSTALL_CANCELLED = "VERSION_INSTALL_CANCELLED";
export const LOADER_CHANGE_RUNNING = "LOADER_CHANGE_RUNNING";
export const LOADER_CHANGE_UNVERIFIED = "LOADER_CHANGE_UNVERIFIED";
export const LOADER_CHANGE_NOT_FOUND = "LOADER_CHANGE_NOT_FOUND";

export type VersionInstallOperation =
  | "install"
  | "integrity"
  | "server"
  | "loader"
  | "content"
  | "update";

export type VersionInstallStage =
  | "preparing"
  | "manifest"
  | "java"
  | "loader"
  | "installer"
  | "assets"
  | "files"
  | "mods"
  | "packs"
  | "worlds"
  | "serverMods"
  | "cleanup"
  | "other"
  | "options"
  | "done";

export interface VersionInstallOptions {
  operation?: VersionInstallOperation;
  cleanupOnCancel?: boolean;
  keepProgressOpen?: boolean;
  plan?: VersionInstallStage[];
}

export interface VersionInstallResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  failures?: DownloaderFailureItem[];
}

export interface LoaderChangeResult extends VersionInstallResult {
  loaderVersion?: { id: string; url: string };
}

export interface VersionInstallSubProgress {
  kind: "loaderInstaller";
  progressPercent: number;
  isIndeterminate?: boolean;
  titleKey?: string;
  details?: string;
  detailsKey?: string;
  detailsParams?: Record<string, string | number | boolean | null | undefined>;
}

export interface VersionInstallProgress {
  versionName: string;
  loaderName: Loader;
  operation: VersionInstallOperation;
  stage: VersionInstallStage;
  progressPercent: number;
  isIndeterminate?: boolean;
  details?: string;
  detailsKey?: string;
  detailsParams?: Record<string, string | number | boolean | null | undefined>;
  subProgress?: VersionInstallSubProgress;
  plan?: VersionInstallStage[];
}
