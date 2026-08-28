export type WorldBackupTrigger = "manual" | "auto" | "preRestore";

export type WorldBackupErrorCode =
  | "worldMissing"
  | "worldUnreadable"
  | "worldTooLarge"
  | "backupTooLarge"
  | "versionRunning"
  | "backupMissing"
  | "archiveInvalid"
  | "failed";

export interface IWorldBackup {
  id: string;
  worldName: string;
  worldFolder: string;
  versionName: string;
  instanceId?: string;
  createdAt: number;
  size: number;
  trigger: WorldBackupTrigger;
}

export interface IWorldBackupsSummary {
  count: number;
  size: number;
}

export interface IWorldPreservedCopy {
  path: string;
  createdAt: number;
  size: number;
}

export interface IWorldBackupList {
  backups: IWorldBackup[];
  skipReason: WorldBackupErrorCode | null;
  preserved: IWorldPreservedCopy[];
}

export type WorldBackupCreateResult =
  | { ok: true; backup: IWorldBackup; pruned: number }
  | { ok: false; error: WorldBackupErrorCode };

export type WorldBackupRestoreResult =
  | { ok: true; safetyBackupId: string | null; preservedPath: string | null }
  | { ok: false; error: WorldBackupErrorCode };

export type WorldBackupDeleteResult =
  | { ok: true }
  | { ok: false; error: WorldBackupErrorCode };

export const MAX_BACKUP_WORLD_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_RESTORE_ARCHIVE_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_WORLD_BACKUP_KEEP = 5;
export const MIN_WORLD_BACKUP_KEEP = 1;
export const MAX_WORLD_BACKUP_KEEP = 20;

export function normalizeWorldBackupKeep(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_WORLD_BACKUP_KEEP;

  return Math.min(
    MAX_WORLD_BACKUP_KEEP,
    Math.max(MIN_WORLD_BACKUP_KEEP, Math.round(parsed)),
  );
}
