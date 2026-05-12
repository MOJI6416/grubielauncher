import { Loader } from "./Loader";

export const VERSION_INSTALL_CANCELLED = "VERSION_INSTALL_CANCELLED";

export type VersionInstallOperation = "install" | "integrity";

export type VersionInstallStage =
  | "preparing"
  | "manifest"
  | "java"
  | "loader"
  | "installer"
  | "assets"
  | "files"
  | "mods"
  | "other"
  | "options"
  | "done";

export interface VersionInstallOptions {
  operation?: VersionInstallOperation;
  cleanupOnCancel?: boolean;
  keepProgressOpen?: boolean;
}

export interface VersionInstallResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
}

export interface VersionInstallProgress {
  versionName: string;
  loaderName: Loader;
  operation: VersionInstallOperation;
  stage: VersionInstallStage;
  progressPercent: number;
  isIndeterminate?: boolean;
  details?: string;
}
