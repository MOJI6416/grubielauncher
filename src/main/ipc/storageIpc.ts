import { handleSafe } from "../utilities/ipc";
import {
  cleanupStorage,
  clearCaches,
  getStorageBreakdown,
} from "../utilities/storage";
import { isVersionInstallActive } from "./versionIpc";
import { gameRuntime } from "../utilities/runtime";
import type {
  StorageBreakdown,
  StorageCleanupKind,
  StorageClearResult,
} from "@/types/Storage";

function isLauncherBusy(): boolean {
  return isVersionInstallActive() || gameRuntime.processes.size > 0;
}

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
  failed: true,
};

export function registerStorageIpc() {
  handleSafe<StorageBreakdown>("storage:getBreakdown", EMPTY_BREAKDOWN, () => {
    return getStorageBreakdown();
  });

  handleSafe<StorageClearResult>(
    "storage:clearCache",
    { freed: 0, failed: true },
    () => {
      if (isLauncherBusy()) return { freed: 0, blocked: true };
      return clearCaches();
    },
  );

  handleSafe<StorageClearResult>(
    "storage:cleanup",
    { freed: 0, failed: true },
    (_, kind: StorageCleanupKind) => {
      if (isLauncherBusy()) return { freed: 0, blocked: true };
      return cleanupStorage(kind);
    },
  );
}
