import { shell } from "electron";
import fs from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";
import {
  DEFAULT_WORLD_BACKUP_KEEP,
  IWorldBackup,
  IWorldBackupList,
  IWorldBackupsSummary,
  IWorldPreservedCopy,
  MAX_BACKUP_WORLD_BYTES,
  MAX_RESTORE_ARCHIVE_BYTES,
  normalizeWorldBackupKeep,
  WorldBackupCreateResult,
  WorldBackupDeleteResult,
  WorldBackupErrorCode,
  WorldBackupRestoreResult,
  WorldBackupTrigger,
} from "@/types/WorldBackup";
import { getLauncherPaths } from "./other";
import { ensureInstanceId, readInstanceId } from "./instanceId";
import { writeJsonAtomic } from "./atomicJson";
import { createZipArchive, extractZip } from "./archiver";
import { readWorldDisplayName } from "./worlds";
import { gameProcesses } from "./runtime";

const INDEX_FILE_NAME = "index.json";
const SKIP_STATE_FILE_NAME = "skipped.json";
const PENDING_RESTORE_FILE_NAME = "pending-restore.json";
const RESTORE_TEMP_DIR_NAME = "world-restore";
export const DISPLACED_DIR_NAME = ".grubie-restore";
const PRESERVED_MARKER_FILE = ".grubie-preserved";
const BACKUP_ID_PATTERN = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const UNOWNED_INSTANCE_ID = "";
const EXCLUDED_FILE_NAMES = new Set(["session.lock", ".grubie-preserved"]);
const PRE_RESTORE_KEEP = 3;
const BACKUP_COMPRESSION_LEVEL = 6;
const RESTORE_ARCHIVE_LIMITS = {
  maxArchiveBytes: MAX_RESTORE_ARCHIVE_BYTES,
  maxTotalUncompressedBytes: 4 * MAX_BACKUP_WORLD_BYTES,
};

interface PendingRestore {
  worldPath: string;
  displacedPath: string;
  keepDisplaced: boolean;
}

interface SkipRecord {
  reason: WorldBackupErrorCode;
  sourceSize: number;
}

let operationQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = operationQueue.then(task, task);
  operationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function getBackupsDir(): string {
  return path.join(getLauncherPaths().launcher, "backups");
}

function getIndexPath(): string {
  return path.join(getBackupsDir(), INDEX_FILE_NAME);
}

function getSkipStatePath(): string {
  return path.join(getBackupsDir(), SKIP_STATE_FILE_NAME);
}

function getPendingRestorePath(): string {
  return path.join(getBackupsDir(), PENDING_RESTORE_FILE_NAME);
}

export function isValidBackupId(id: unknown): id is string {
  return typeof id === "string" && BACKUP_ID_PATTERN.test(id);
}

function getBackupFilePath(id: string): string {
  return path.join(getBackupsDir(), `${id}.zip`);
}

function normalizeTrigger(value: unknown): WorldBackupTrigger {
  return value === "manual" || value === "auto" || value === "preRestore"
    ? value
    : "manual";
}

export function normalizeBackupEntry(value: unknown): IWorldBackup | null {
  if (!value || typeof value !== "object") return null;

  const entry = value as Partial<IWorldBackup>;
  if (!isValidBackupId(entry.id)) return null;
  if (typeof entry.worldFolder !== "string" || !entry.worldFolder) return null;
  if (typeof entry.versionName !== "string" || !entry.versionName) return null;

  const createdAt = Number(entry.createdAt);
  const size = Number(entry.size);

  return {
    id: entry.id,
    worldName:
      typeof entry.worldName === "string" && entry.worldName
        ? entry.worldName
        : entry.worldFolder,
    worldFolder: entry.worldFolder,
    versionName: entry.versionName,
    instanceId:
      typeof entry.instanceId === "string" ? entry.instanceId : undefined,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0,
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    trigger: normalizeTrigger(entry.trigger),
  };
}

export class WorldBackupIndexError extends Error {
  constructor(cause: unknown) {
    super("The world backup index could not be read");
    this.name = "WorldBackupIndexError";
    this.cause = cause;
  }
}

async function readIndex(): Promise<IWorldBackup[]> {
  let stored: unknown;

  try {
    stored = await fs.readJSON(getIndexPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return [];
    console.error(`[backups] unreadable index ${getIndexPath()}:`, error);
    throw new WorldBackupIndexError(error);
  }

  if (!Array.isArray(stored)) {
    console.error(`[backups] the index ${getIndexPath()} is not a list`);
    throw new WorldBackupIndexError(new Error("index is not a list"));
  }

  const seen = new Set<string>();
  const entries: IWorldBackup[] = [];

  for (const value of stored) {
    const entry = normalizeBackupEntry(value);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }

  return await adoptLegacyEntries(entries);
}

function isPlainFolderName(name: string): boolean {
  return (
    Boolean(name) &&
    name !== "." &&
    name !== ".." &&
    path.basename(name) === name
  );
}

async function resolveAdoptedId(
  versionsPath: string,
  versionName: string,
): Promise<string | null> {
  if (!isPlainFolderName(versionName)) return UNOWNED_INSTANCE_ID;

  const versionPath = path.join(versionsPath, versionName);
  const stats = await fs.stat(versionPath).catch(() => null);
  if (!stats?.isDirectory()) return UNOWNED_INSTANCE_ID;

  return await ensureInstanceId(versionPath);
}

async function adoptLegacyEntries(
  entries: IWorldBackup[],
): Promise<IWorldBackup[]> {
  if (entries.every((entry) => entry.instanceId !== undefined)) return entries;

  const versionsPath = path.join(getLauncherPaths().minecraft, "versions");
  const versionsStats = await fs.stat(versionsPath).catch(() => null);
  if (!versionsStats?.isDirectory()) return entries;

  const adopted = new Map<string, string | null>();
  let changed = false;

  for (const entry of entries) {
    if (entry.instanceId !== undefined) continue;

    if (!adopted.has(entry.versionName)) {
      adopted.set(
        entry.versionName,
        await resolveAdoptedId(versionsPath, entry.versionName),
      );
    }

    const instanceId = adopted.get(entry.versionName) ?? null;
    if (instanceId === null) continue;

    entry.instanceId = instanceId;
    changed = true;
  }

  if (changed) {
    await writeIndex(entries).catch((error) =>
      console.error(`[backups] the index kept its old records:`, error),
    );
  }

  return entries;
}

async function writeIndex(entries: IWorldBackup[]): Promise<void> {
  await fs.ensureDir(getBackupsDir());
  await writeJsonAtomic(getIndexPath(), entries);
}

function getWorldKey(instanceId: string, worldFolder: string): string {
  return `${instanceId}::${worldFolder}`;
}

async function readSkipState(): Promise<Record<string, SkipRecord>> {
  const stored = await fs.readJSON(getSkipStatePath()).catch(() => null);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};

  const state: Record<string, SkipRecord> = {};

  for (const [key, value] of Object.entries(stored)) {
    if (value === "worldTooLarge") {
      state[key] = { reason: "worldTooLarge", sourceSize: 0 };
      continue;
    }

    if (!value || typeof value !== "object") continue;

    const record = value as Partial<SkipRecord>;
    if (
      record.reason !== "worldTooLarge" &&
      record.reason !== "worldUnreadable" &&
      record.reason !== "failed"
    ) {
      continue;
    }

    const sourceSize = Number(record.sourceSize);
    state[key] = {
      reason: record.reason,
      sourceSize: Number.isFinite(sourceSize) && sourceSize > 0 ? sourceSize : 0,
    };
  }

  return state;
}

async function setSkipRecord(
  key: string,
  record: SkipRecord | null,
): Promise<void> {
  const state = await readSkipState();

  if (record === null) {
    if (!(key in state)) return;
    delete state[key];
  } else {
    const current = state[key];
    if (current?.reason === record.reason && current.sourceSize === record.sourceSize) {
      return;
    }
    state[key] = record;
  }

  await fs.ensureDir(getBackupsDir());
  await writeJsonAtomic(getSkipStatePath(), state);
}

export function getVersionPathFromWorldPath(worldPath: string): string {
  return path.dirname(path.dirname(path.resolve(worldPath)));
}

function sortBackups(entries: IWorldBackup[]): IWorldBackup[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.createdAt - a.entry.createdAt || b.index - a.index)
    .map((item) => item.entry);
}

function selectBackupsForWorld(
  entries: IWorldBackup[],
  instanceId: string,
  worldFolder: string,
): IWorldBackup[] {
  return sortBackups(
    entries.filter(
      (entry) =>
        entry.instanceId === instanceId && entry.worldFolder === worldFolder,
    ),
  );
}

export function selectPrunableBackups(
  worldBackups: IWorldBackup[],
  keep: number,
  protectedIds?: Iterable<string>,
): IWorldBackup[] {
  const protectedSet = new Set(protectedIds ?? []);
  const sorted = sortBackups(worldBackups);

  const automatic = sorted.filter((entry) => entry.trigger === "auto");
  const safety = sorted.filter((entry) => entry.trigger === "preRestore");

  return [
    ...automatic.slice(normalizeWorldBackupKeep(keep)),
    ...safety.slice(1, Math.max(1, safety.length - (PRE_RESTORE_KEEP - 1))),
  ].filter((entry) => !protectedSet.has(entry.id));
}

export function shouldAutoBackup(
  levelDatMtimeMs: number,
  worldBackups: IWorldBackup[],
  changedSince = 0,
): boolean {
  if (!Number.isFinite(levelDatMtimeMs) || levelDatMtimeMs <= 0) return false;

  const newest = sortBackups(worldBackups)[0];
  if (!newest) return levelDatMtimeMs >= changedSince;

  return levelDatMtimeMs > newest.createdAt;
}

class WorldUnreadableError extends Error {
  constructor(target: string) {
    super(`Cannot read world folder: ${target}`);
    this.name = "WorldUnreadableError";
  }
}

async function collectWorldFiles(root: string, out: string[]): Promise<number> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    throw new WorldUnreadableError(root);
  }

  let total = 0;

  for (const entry of entries) {
    if (EXCLUDED_FILE_NAMES.has(entry.name)) continue;

    const full = path.join(root, entry.name);

    if (entry.isDirectory()) {
      total += await collectWorldFiles(full, out);
      if (total > MAX_BACKUP_WORLD_BYTES) return total;
      continue;
    }

    if (!entry.isFile()) continue;

    const stats = await fs.stat(full).catch(() => null);
    if (!stats) continue;

    out.push(full);
    total += stats.size;

    if (total > MAX_BACKUP_WORLD_BYTES) return total;
  }

  return total;
}

export function isVersionRunning(versionPath: string): boolean {
  const target = path.resolve(versionPath);

  for (const record of gameProcesses.values()) {
    if (record.process.exitCode !== null) continue;
    if (path.resolve(record.versionPath) === target) return true;
  }

  return false;
}

async function createBackupUnsafe(
  worldPath: string,
  trigger: WorldBackupTrigger,
  keep: number,
  protectedIds?: Iterable<string>,
): Promise<WorldBackupCreateResult> {
  const resolvedWorldPath = path.resolve(worldPath);
  const worldFolder = path.basename(resolvedWorldPath);
  const versionPath = getVersionPathFromWorldPath(resolvedWorldPath);
  const versionName = path.basename(versionPath);

  if (isVersionRunning(versionPath)) {
    return { ok: false, error: "versionRunning" };
  }

  if (!(await fs.pathExists(path.join(resolvedWorldPath, "level.dat")))) {
    return { ok: false, error: "worldMissing" };
  }

  const instanceId = await ensureInstanceId(versionPath);
  if (!instanceId) return { ok: false, error: "failed" };

  const worldKey = getWorldKey(instanceId, worldFolder);

  const files: string[] = [];
  let sourceSize: number;
  try {
    sourceSize = await collectWorldFiles(resolvedWorldPath, files);
  } catch (error) {
    if (error instanceof WorldUnreadableError) {
      console.error("Failed to read the world folder:", error.message);
      await setSkipRecord(worldKey, {
        reason: "worldUnreadable",
        sourceSize: 0,
      });
      return { ok: false, error: "worldUnreadable" };
    }
    throw error;
  }

  if (sourceSize > MAX_BACKUP_WORLD_BYTES) {
    await setSkipRecord(worldKey, { reason: "worldTooLarge", sourceSize });
    return { ok: false, error: "worldTooLarge" };
  }

  if (!files.length) return { ok: false, error: "worldMissing" };

  const skipped = (await readSkipState())[worldKey];
  if (skipped?.sourceSize && sourceSize >= skipped.sourceSize) {
    return { ok: false, error: "worldTooLarge" };
  }

  const entries = await readIndex();

  const id = randomUUID();
  const targetPath = getBackupFilePath(id);

  await fs.ensureDir(getBackupsDir());

  try {
    await createZipArchive(
      files,
      targetPath,
      path.dirname(resolvedWorldPath),
      BACKUP_COMPRESSION_LEVEL,
    );
  } catch (error) {
    await fs.remove(targetPath).catch(() => {});
    throw error;
  }

  const stats = await fs.stat(targetPath).catch(() => null);
  if (!stats?.isFile()) {
    await fs.remove(targetPath).catch(() => {});
    return { ok: false, error: "failed" };
  }

  if (stats.size > MAX_RESTORE_ARCHIVE_BYTES) {
    await fs.remove(targetPath).catch(() => {});
    await setSkipRecord(worldKey, { reason: "worldTooLarge", sourceSize });
    return { ok: false, error: "worldTooLarge" };
  }

  const backup: IWorldBackup = {
    id,
    worldName: await readWorldDisplayName(resolvedWorldPath),
    worldFolder,
    versionName,
    instanceId,
    createdAt: Date.now(),
    size: stats.size,
    trigger,
  };

  entries.push(backup);

  const prunable = selectPrunableBackups(
    selectBackupsForWorld(entries, instanceId, worldFolder),
    keep,
    [backup.id, ...(protectedIds ?? [])],
  );
  const prunedIds = new Set(prunable.map((entry) => entry.id));

  for (const entry of prunable) {
    await fs.remove(getBackupFilePath(entry.id)).catch(() => {});
  }

  await writeIndex(entries.filter((entry) => !prunedIds.has(entry.id)));
  await setSkipRecord(worldKey, null);

  return { ok: true, backup, pruned: prunedIds.size };
}

async function recordAutoBackupFailure(worldPath: string): Promise<void> {
  const resolved = path.resolve(worldPath);
  const instanceId = await readInstanceId(
    getVersionPathFromWorldPath(resolved),
  ).catch(() => null);

  if (!instanceId) return;

  await setSkipRecord(getWorldKey(instanceId, path.basename(resolved)), {
    reason: "failed",
    sourceSize: 0,
  }).catch(() => {});
}

export function createWorldBackup(
  worldPath: string,
  trigger: WorldBackupTrigger = "manual",
  keep: number = DEFAULT_WORLD_BACKUP_KEEP,
): Promise<WorldBackupCreateResult> {
  return enqueue(async () => {
    try {
      const result = await createBackupUnsafe(worldPath, trigger, keep);

      if (trigger === "auto" && !result.ok && result.error === "failed") {
        await recordAutoBackupFailure(worldPath);
      }

      return result;
    } catch (error) {
      console.error("Failed to create world backup:", error);
      if (trigger === "auto") await recordAutoBackupFailure(worldPath);
      return { ok: false, error: "failed" } as WorldBackupCreateResult;
    }
  });
}

async function listBackupsForWorld(
  resolvedWorldPath: string,
): Promise<IWorldBackup[]> {
  const versionPath = getVersionPathFromWorldPath(resolvedWorldPath);

  const entries = await readIndex();
  const instanceId = await readInstanceId(versionPath);
  if (!instanceId) return [];

  const worldBackups = selectBackupsForWorld(
    entries,
    instanceId,
    path.basename(resolvedWorldPath),
  );

  const versionName = path.basename(versionPath);
  const existing: IWorldBackup[] = [];
  for (const entry of worldBackups) {
    if (!(await fs.pathExists(getBackupFilePath(entry.id)))) continue;
    existing.push({ ...entry, versionName });
  }

  return existing;
}

async function directorySize(target: string): Promise<number> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    const full = path.join(target, entry.name);

    if (entry.isDirectory()) {
      total += await directorySize(full);
      continue;
    }

    const stats = await fs.lstat(full).catch(() => null);
    if (stats?.isFile()) total += stats.size;
  }

  return total;
}

async function readPreservedOwner(copyPath: string): Promise<string | null> {
  const marker = await fs
    .readFile(path.join(copyPath, PRESERVED_MARKER_FILE), "utf-8")
    .catch(() => null);

  const owner = marker?.trim();
  if (owner) return owner;

  const match = /^(.*)-\d+$/.exec(path.basename(copyPath));
  return match ? match[1] : null;
}

function readPreservedStamp(copyPath: string): number {
  const match = /-(\d+)$/.exec(path.basename(copyPath));
  const stamp = match ? Number(match[1]) : 0;
  return Number.isFinite(stamp) && stamp > 0 ? stamp : 0;
}

async function listPreservedEntries(savesPath: string): Promise<string[]> {
  const displacedRoot = path.join(savesPath, DISPLACED_DIR_NAME);

  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(displacedRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(displacedRoot, entry.name));
}

export async function listPreservedCopies(
  worldPath: string,
): Promise<IWorldPreservedCopy[]> {
  const resolvedWorldPath = path.resolve(worldPath);
  const worldFolder = path.basename(resolvedWorldPath);

  const copies: IWorldPreservedCopy[] = [];

  for (const full of await listPreservedEntries(
    path.dirname(resolvedWorldPath),
  )) {
    if ((await readPreservedOwner(full)) !== worldFolder) continue;

    copies.push({
      path: full,
      createdAt: readPreservedStamp(full),
      size: await directorySize(full),
    });
  }

  return copies.sort((a, b) => b.createdAt - a.createdAt);
}

export function isPreservedCopyPath(target: unknown): target is string {
  if (typeof target !== "string" || !target) return false;

  const resolved = path.resolve(target);
  const versionsPath = path.join(getLauncherPaths().minecraft, "versions");
  const relative = path.relative(versionsPath, resolved);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }

  const parts = relative.split(path.sep);
  return (
    parts.length === 4 && parts[1] === "saves" && parts[2] === DISPLACED_DIR_NAME
  );
}

export function deletePreservedCopy(
  targetPath: string,
): Promise<WorldBackupDeleteResult> {
  return enqueue(async () => {
    if (!isPreservedCopyPath(targetPath)) {
      return { ok: false, error: "backupMissing" } as WorldBackupDeleteResult;
    }

    try {
      const resolved = path.resolve(targetPath);
      if (!(await fs.pathExists(resolved))) {
        return { ok: false, error: "backupMissing" } as WorldBackupDeleteResult;
      }

      const trashed = await shell
        .trashItem(resolved)
        .then(() => true)
        .catch(() => false);

      if (!trashed) await fs.remove(resolved);
      await fs.rmdir(path.dirname(resolved)).catch(() => {});

      return { ok: true } as WorldBackupDeleteResult;
    } catch (error) {
      console.error("Failed to delete a preserved world copy:", error);
      return { ok: false, error: "failed" } as WorldBackupDeleteResult;
    }
  });
}

export async function getPreservedCopiesSize(): Promise<number> {
  const versionsPath = path.join(getLauncherPaths().minecraft, "versions");

  let versions: fs.Dirent[];
  try {
    versions = await fs.readdir(versionsPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const version of versions) {
    if (!version.isDirectory()) continue;

    total += await directorySize(
      path.join(versionsPath, version.name, "saves", DISPLACED_DIR_NAME),
    );
  }

  return total;
}

export async function getWorldBackupList(
  worldPath: string,
): Promise<IWorldBackupList> {
  const resolvedWorldPath = path.resolve(worldPath);
  const versionPath = getVersionPathFromWorldPath(resolvedWorldPath);

  const [backups, skipState, preserved] = await Promise.all([
    listBackupsForWorld(resolvedWorldPath),
    readSkipState(),
    listPreservedCopies(resolvedWorldPath),
  ]);

  const instanceId = await readInstanceId(versionPath);
  const worldKey = instanceId
    ? getWorldKey(instanceId, path.basename(resolvedWorldPath))
    : null;

  return {
    backups,
    skipReason: (worldKey ? skipState[worldKey]?.reason : null) ?? null,
    preserved,
  };
}

export function reassignWorldBackups(
  versionPath: string,
  fromFolder: string,
  toFolder: string,
  worldName: string,
): Promise<void> {
  return enqueue(async () => {
    if (!fromFolder || !toFolder || fromFolder === toFolder) return;

    const entries = await readIndex();
    const instanceId = await readInstanceId(versionPath);
    if (!instanceId) return;

    let changed = false;

    for (const entry of entries) {
      if (entry.instanceId !== instanceId) continue;
      if (entry.worldFolder !== fromFolder) continue;

      entry.worldFolder = toFolder;
      entry.worldName = worldName || toFolder;
      changed = true;
    }

    if (changed) await writeIndex(entries);

    const skipState = await readSkipState();
    const fromKey = getWorldKey(instanceId, fromFolder);
    const record = skipState[fromKey];

    if (record) {
      await setSkipRecord(getWorldKey(instanceId, toFolder), record);
      await setSkipRecord(fromKey, null);
    }
  });
}

export async function reassignPreservedCopies(
  savesPath: string,
  fromFolder: string,
  toFolder: string,
): Promise<void> {
  if (!fromFolder || !toFolder || fromFolder === toFolder) return;

  for (const full of await listPreservedEntries(savesPath)) {
    if ((await readPreservedOwner(full)) !== fromFolder) continue;

    await fs
      .writeFile(path.join(full, PRESERVED_MARKER_FILE), toFolder, "utf-8")
      .catch(() => {});
  }
}

export async function countWorldBackups(
  versionPath: string,
): Promise<Record<string, number>> {
  const entries = await readIndex();
  const instanceId = await readInstanceId(versionPath);
  if (!instanceId) return {};

  const counts: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.instanceId !== instanceId) continue;
    if (!(await fs.pathExists(getBackupFilePath(entry.id)))) continue;

    counts[entry.worldFolder] = (counts[entry.worldFolder] ?? 0) + 1;
  }

  return counts;
}

export function pickArchiveRoot(
  rootHasLevelDat: boolean,
  directories: string[],
): string | null {
  if (rootHasLevelDat) return "";
  return directories.length === 1 ? directories[0] : null;
}

async function resolveExtractedWorld(tempDir: string): Promise<string | null> {
  const rootHasLevelDat = await fs.pathExists(path.join(tempDir, "level.dat"));

  const entries = await fs.readdir(tempDir, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const root = pickArchiveRoot(rootHasLevelDat, directories);
  if (root === null) return null;

  const source = root ? path.join(tempDir, root) : tempDir;
  if (!(await fs.pathExists(path.join(source, "level.dat")))) return null;

  return source;
}

async function restoreBackupUnsafe(
  backupId: string,
  worldPath: string,
  keep: number,
): Promise<WorldBackupRestoreResult> {
  if (!isValidBackupId(backupId)) {
    return { ok: false, error: "backupMissing" };
  }

  const resolvedWorldPath = path.resolve(worldPath);
  const worldFolder = path.basename(resolvedWorldPath);
  const savesPath = path.dirname(resolvedWorldPath);
  const versionPath = getVersionPathFromWorldPath(resolvedWorldPath);

  const entries = await readIndex();
  const backup = entries.find((entry) => entry.id === backupId);
  if (!backup) return { ok: false, error: "backupMissing" };

  const instanceId = await readInstanceId(versionPath);

  if (
    backup.worldFolder !== worldFolder ||
    !instanceId ||
    backup.instanceId !== instanceId
  ) {
    return { ok: false, error: "backupMissing" };
  }

  const backupFile = getBackupFilePath(backupId);
  const backupStats = await fs.stat(backupFile).catch(() => null);
  if (!backupStats?.isFile()) {
    return { ok: false, error: "backupMissing" };
  }

  if (backupStats.size > MAX_RESTORE_ARCHIVE_BYTES) {
    return { ok: false, error: "backupTooLarge" };
  }

  if (isVersionRunning(versionPath)) {
    return { ok: false, error: "versionRunning" };
  }

  const worldExists = await fs.pathExists(resolvedWorldPath);

  let safetyBackupId: string | null = null;
  if (worldExists) {
    const safety = await createBackupUnsafe(
      resolvedWorldPath,
      "preRestore",
      keep,
      [backupId],
    ).catch(() => null);

    if (safety?.ok) safetyBackupId = safety.backup.id;
  }

  const keepDisplaced = worldExists && safetyBackupId === null;

  if (!(await fs.pathExists(backupFile))) {
    return { ok: false, error: "backupMissing" };
  }

  const tempRoot = path.join(
    getLauncherPaths().cache,
    RESTORE_TEMP_DIR_NAME,
    randomUUID(),
  );

  try {
    await fs.ensureDir(tempRoot);
    await extractZip(backupFile, tempRoot, RESTORE_ARCHIVE_LIMITS);

    const source = await resolveExtractedWorld(tempRoot);
    if (!source) return { ok: false, error: "archiveInvalid" };

    const displacedPath = path.join(
      savesPath,
      DISPLACED_DIR_NAME,
      `${worldFolder}-${Date.now()}`,
    );

    if (worldExists) {
      await fs.ensureDir(path.dirname(displacedPath));
      await fs.ensureDir(getBackupsDir());
      await writeJsonAtomic(getPendingRestorePath(), {
        worldPath: resolvedWorldPath,
        displacedPath,
        keepDisplaced,
      });

      await fs.move(resolvedWorldPath, displacedPath);
    }

    try {
      await fs.move(source, resolvedWorldPath);
    } catch (error) {
      if (worldExists) {
        await fs.remove(resolvedWorldPath).catch(() => {});
        await fs.move(displacedPath, resolvedWorldPath).catch(() => {});
        await fs.remove(getPendingRestorePath()).catch(() => {});
        await fs.rmdir(path.dirname(displacedPath)).catch(() => {});
      }
      throw error;
    }

    if (!worldExists) return { ok: true, safetyBackupId, preservedPath: null };

    await fs.remove(getPendingRestorePath()).catch(() => {});

    if (keepDisplaced) {
      await fs
        .writeFile(
          path.join(displacedPath, PRESERVED_MARKER_FILE),
          worldFolder,
          "utf-8",
        )
        .catch(() => {});

      return { ok: true, safetyBackupId, preservedPath: displacedPath };
    }

    const trashed = await shell
      .trashItem(displacedPath)
      .then(() => true)
      .catch(() => false);

    if (!trashed) await fs.remove(displacedPath).catch(() => {});
    await fs.rmdir(path.dirname(displacedPath)).catch(() => {});

    return { ok: true, safetyBackupId, preservedPath: null };
  } finally {
    await fs.remove(tempRoot).catch(() => {});
  }
}

export function restoreWorldBackup(
  backupId: string,
  worldPath: string,
  keep: number = DEFAULT_WORLD_BACKUP_KEEP,
): Promise<WorldBackupRestoreResult> {
  return enqueue(async () => {
    try {
      return await restoreBackupUnsafe(backupId, worldPath, keep);
    } catch (error) {
      console.error("Failed to restore world backup:", error);
      return { ok: false, error: "failed" } as WorldBackupRestoreResult;
    }
  });
}

export function deleteWorldBackup(
  backupId: string,
): Promise<WorldBackupDeleteResult> {
  return enqueue(async () => {
    if (!isValidBackupId(backupId)) {
      return { ok: false, error: "backupMissing" } as WorldBackupDeleteResult;
    }

    try {
      const entries = await readIndex();

      await fs.remove(getBackupFilePath(backupId));
      await writeIndex(entries.filter((entry) => entry.id !== backupId));

      return { ok: true } as WorldBackupDeleteResult;
    } catch (error) {
      console.error("Failed to delete world backup:", error);
      return { ok: false, error: "failed" } as WorldBackupDeleteResult;
    }
  });
}

async function listBackupFilesOnDisk(): Promise<Map<string, number>> {
  const files = new Map<string, number>();

  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(getBackupsDir(), { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".zip")) continue;

    const id = entry.name.slice(0, -4);
    if (!isValidBackupId(id)) continue;

    const stats = await fs
      .stat(path.join(getBackupsDir(), entry.name))
      .catch(() => null);
    if (!stats?.isFile()) continue;

    files.set(id, stats.size);
  }

  return files;
}

async function collectOrphanPreserved(): Promise<{
  paths: string[];
  size: number;
}> {
  const versionsPath = path.join(getLauncherPaths().minecraft, "versions");

  let versions: fs.Dirent[];
  try {
    versions = await fs.readdir(versionsPath, { withFileTypes: true });
  } catch {
    return { paths: [], size: 0 };
  }

  const paths: string[] = [];
  let size = 0;

  for (const version of versions) {
    if (!version.isDirectory()) continue;

    const savesPath = path.join(versionsPath, version.name, "saves");

    for (const full of await listPreservedEntries(savesPath)) {
      const owner = await readPreservedOwner(full);
      if (owner && (await fs.pathExists(path.join(savesPath, owner)))) continue;

      size += await directorySize(full);
      paths.push(full);
    }
  }

  return { paths, size };
}

async function collectLiveInstanceIds(
  versionsPath: string,
): Promise<Set<string>> {
  const ids = new Set<string>();

  let versions: fs.Dirent[];
  try {
    versions = await fs.readdir(versionsPath, { withFileTypes: true });
  } catch {
    return ids;
  }

  for (const version of versions) {
    if (!version.isDirectory()) continue;

    const id = await readInstanceId(path.join(versionsPath, version.name));
    if (id) ids.add(id);
  }

  return ids;
}

async function partitionOrphanBackups(): Promise<{
  orphanIds: string[];
  orphanPreserved: string[];
  survivors: IWorldBackup[];
  size: number;
  indexChanged: boolean;
}> {
  const versionsPath = path.join(getLauncherPaths().minecraft, "versions");
  const entries = await readIndex();

  if (entries.length > 0) {
    const versionsStats = await fs.stat(versionsPath).catch(() => null);
    if (!versionsStats?.isDirectory()) {
      throw new WorldBackupIndexError(
        new Error(`the instances folder ${versionsPath} is not readable`),
      );
    }
  }

  const files = await listBackupFilesOnDisk();
  const liveIds = await collectLiveInstanceIds(versionsPath);

  const orphanIds: string[] = [];
  const survivors: IWorldBackup[] = [];
  const indexed = new Set<string>();
  let size = 0;

  for (const entry of entries) {
    indexed.add(entry.id);

    if (entry.instanceId === undefined || liveIds.has(entry.instanceId)) {
      survivors.push(entry);
      continue;
    }

    size += files.get(entry.id) ?? 0;
    orphanIds.push(entry.id);
  }

  for (const [id, fileSize] of files) {
    if (indexed.has(id)) continue;

    size += fileSize;
    orphanIds.push(id);
  }

  const preserved = await collectOrphanPreserved();

  return {
    orphanIds,
    orphanPreserved: preserved.paths,
    survivors,
    size: size + preserved.size,
    indexChanged: survivors.length !== entries.length,
  };
}

export async function getOrphanBackupsStats(): Promise<IWorldBackupsSummary> {
  const { orphanIds, orphanPreserved, size } = await partitionOrphanBackups();
  return { count: orphanIds.length + orphanPreserved.length, size };
}

export function cleanupOrphanBackups(): Promise<IWorldBackupsSummary> {
  return enqueue(async () => {
    const { orphanIds, orphanPreserved, survivors, size, indexChanged } =
      await partitionOrphanBackups();

    const count = orphanIds.length + orphanPreserved.length;
    if (!count) return { count: 0, size: 0 };

    for (const id of orphanIds) {
      await fs.remove(getBackupFilePath(id)).catch(() => {});
    }

    for (const target of orphanPreserved) {
      const trashed = await shell
        .trashItem(target)
        .then(() => true)
        .catch(() => false);

      if (!trashed) await fs.remove(target).catch(() => {});
      await fs.rmdir(path.dirname(target)).catch(() => {});
    }

    if (indexChanged) await writeIndex(survivors);

    return { count, size };
  });
}

export async function runAutoBackupForVersion(
  versionPath: string,
  keep: number,
  changedSince = 0,
): Promise<number> {
  const resolvedVersionPath = path.resolve(versionPath);
  if (isVersionRunning(resolvedVersionPath)) return 0;

  const savesPath = path.join(resolvedVersionPath, "saves");
  if (!(await fs.pathExists(savesPath))) return 0;

  let folders: fs.Dirent[];
  try {
    folders = await fs.readdir(savesPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  let created = 0;

  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    if (folder.name === DISPLACED_DIR_NAME) continue;

    const worldPath = path.join(savesPath, folder.name);
    const levelDatStats = await fs
      .stat(path.join(worldPath, "level.dat"))
      .catch(() => null);

    if (!levelDatStats?.isFile()) continue;

    const entries = await readIndex();
    const instanceId = await readInstanceId(resolvedVersionPath);
    const worldBackups = instanceId
      ? selectBackupsForWorld(entries, instanceId, folder.name)
      : [];

    if (!shouldAutoBackup(levelDatStats.mtimeMs, worldBackups, changedSince)) {
      continue;
    }

    const result = await createWorldBackup(worldPath, "auto", keep);
    if (result.ok) created += 1;
  }

  return created;
}

export async function recoverPendingRestore(): Promise<void> {
  try {
    await fs
      .remove(path.join(getLauncherPaths().cache, RESTORE_TEMP_DIR_NAME))
      .catch(() => {});

    const stored = (await fs
      .readJSON(getPendingRestorePath())
      .catch(() => null)) as Partial<PendingRestore> | null;

    if (!stored) return;

    const versionsPath = path.join(getLauncherPaths().minecraft, "versions");
    const isInsideVersions = (target: unknown): target is string => {
      if (typeof target !== "string" || !target) return false;
      const relative = path.relative(versionsPath, path.resolve(target));
      return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
    };

    const { worldPath, displacedPath } = stored;

    if (!isInsideVersions(worldPath) || !isInsideVersions(displacedPath)) {
      await fs.remove(getPendingRestorePath()).catch(() => {});
      return;
    }

    const worldExists = await fs.pathExists(worldPath);
    const displacedExists = await fs.pathExists(displacedPath);

    if (displacedExists) {
      if (!worldExists) {
        await fs.move(displacedPath, worldPath).catch(() => {});
      } else if (stored.keepDisplaced !== true) {
        await fs.remove(displacedPath).catch(() => {});
      }
    }

    await fs.remove(getPendingRestorePath()).catch(() => {});
    await fs.rmdir(path.dirname(displacedPath)).catch(() => {});
  } catch (error) {
    console.error("Failed to recover an interrupted world restore:", error);
  }
}
