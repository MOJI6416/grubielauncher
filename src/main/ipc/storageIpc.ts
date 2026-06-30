import { handleSafe } from "../utilities/ipc";
import {
  cleanupStorage,
  clearCaches,
  getStorageBreakdown,
} from "../utilities/storage";
import type {
  StorageBreakdown,
  StorageCleanupKind,
  StorageClearResult,
} from "@/types/Storage";

const EMPTY_BREAKDOWN: StorageBreakdown = {
  total: 0,
  rootPath: "",
  categories: [],
  versions: [],
  reclaimable: 0,
  cleanup: {
    java: { count: 0, size: 0 },
    libraries: { count: 0, size: 0, safe: false },
  },
  computedAt: 0,
};

export function registerStorageIpc() {
  handleSafe<StorageBreakdown>("storage:getBreakdown", EMPTY_BREAKDOWN, () => {
    return getStorageBreakdown();
  });

  handleSafe<StorageClearResult>("storage:clearCache", { freed: 0 }, () => {
    return clearCaches();
  });

  handleSafe<StorageClearResult>(
    "storage:cleanup",
    { freed: 0 },
    (_, kind: StorageCleanupKind) => {
      return cleanupStorage(kind);
    },
  );
}
