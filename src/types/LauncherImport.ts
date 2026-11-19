import type { Loader } from "./Loader";
import type { IModpack } from "./ModManager";

export const FOREIGN_LAUNCHERS = [
  "prism",
  "multimc",
  "atlauncher",
  "gdlauncher",
  "curseforge",
  "modrinth",
  "official",
  "tlauncher",
  "legacy",
] as const;

export type ForeignLauncher = (typeof FOREIGN_LAUNCHERS)[number];

export const IMPORT_PARTS = [
  "mods",
  "configs",
  "worlds",
  "screenshots",
  "packs",
  "memory",
] as const;

export type ImportPart = (typeof IMPORT_PARTS)[number];

export interface ForeignContentCounts {
  mods: number;
  worlds: number;
  screenshots: number;
  packs: number;
}

export interface ForeignInstanceSummary {
  id: string;
  launcher: ForeignLauncher;
  name: string;
  minecraftVersion: string;
  loader: Loader;
  loaderVersion?: string;
  counts: ForeignContentCounts;
  memoryMb?: number;
  hasJvmArgs: boolean;
  lastPlayed?: number;
  icon?: string;
  sharedGameDir: boolean;
}

export interface LauncherScanResult {
  instances: ForeignInstanceSummary[];
  roots: { launcher: ForeignLauncher; root: string }[];
}

export interface ForeignImportPlan {
  id: string;
  modpack: IModpack;
  sourceRoot: string;
  bytes: number;
  memoryMb?: number;
  jvmArguments: string;
  keepOptimizedJvm: boolean;
  identified: number;
}

export interface ForeignCopyProgress {
  id: string;
  processedBytes: number;
  totalBytes: number;
}
