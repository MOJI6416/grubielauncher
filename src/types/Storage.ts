export type StorageCategoryId =
  | "versions"
  | "libraries"
  | "assets"
  | "java"
  | "backups"
  | "appData"
  | "other";

export interface StorageCategory {
  id: StorageCategoryId;
  size: number;
}

export interface StorageVersionEntry {
  name: string;
  size: number;
}

export interface StorageCleanupEntry {
  count: number;
  size: number;
}

export interface StorageCleanup {
  java: StorageCleanupEntry;
  libraries: StorageCleanupEntry & {
    safe: boolean;
  };
  backups: StorageCleanupEntry;
}

export type StorageCleanupKind = "java" | "libraries" | "backups";

export interface StorageBreakdown {
  total: number;
  rootPath: string;
  categories: StorageCategory[];
  versions: StorageVersionEntry[];
  reclaimable: number;
  cleanup: StorageCleanup;
  computedAt: number;
  failed?: boolean;
}

export interface StorageClearResult {
  freed: number;
  blocked?: boolean;
  failed?: boolean;
}
