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
  instances: StorageCleanupEntry & {
    names: string[];
    dataNames: string[];
  };
}

export type StorageCleanupKind =
  | "java"
  | "libraries"
  | "backups"
  | "instances"
  | "dedupe";

export interface StorageDedupe {
  saved: number;
  potential: number;
  duplicates: number;
}

export interface StorageBreakdown {
  total: number;
  rootPath: string;
  categories: StorageCategory[];
  versions: StorageVersionEntry[];
  reclaimable: number;
  cleanup: StorageCleanup;
  dedupe?: StorageDedupe;
  computedAt: number;
  failed?: boolean;
}

export interface StorageClearResult {
  freed: number;
  blocked?: boolean;
  failed?: boolean;
  kept?: string[];
  unsupported?: boolean;
}
