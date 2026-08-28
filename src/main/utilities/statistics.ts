import { app } from "electron";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs-extra";
import {
  IPlaytimeSyncEntry,
  IVersionSession,
  IVersionStatistics,
} from "@/types/VersionStatistics";
import { writeJsonAtomic } from "./atomicJson";
import { reportFailure } from "./failureBus";

type VersionAggregate = Omit<IVersionStatistics, "lastLaunched"> & {
  lastLaunched: string;
};

export interface SessionContext {
  versionName: string;
  versionPath: string;
  instance: number;
  trackStatistics: boolean;
  accountSub: string | null;
  accountLabel?: string;
}

interface ActiveSession extends SessionContext {
  id: string;
  spawnedAt: number;
  readyAt: number | null;
  spawnedMono: number;
  readyMono: number | null;
  server?: string;
}

interface PendingMarker extends ActiveSession {
  lastSeen: number;
}

const SESSIONS_LIMIT = 500;
const HEARTBEAT_MS = 30_000;
const MAX_SESSION_SECONDS = 24 * 60 * 60;
const LAUNCH_LAG_SECONDS = 30;

const activeSessions = new Map<string, ActiveSession>();
const markerWrites = new Map<string, Promise<void>>();
const endedSessionIds = new Set<string>();
let heartbeatTimer: NodeJS.Timeout | null = null;

const writeChains = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeChains.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function makeKey(versionName: string, instance: number): string {
  return `${versionName}-${instance}`;
}

function dataDir(): string {
  return path.join(app.getPath("appData"), ".grubielauncher", "playtime");
}

function pendingDir(): string {
  return path.join(dataDir(), "pending");
}

function markerPath(id: string): string {
  return path.join(pendingDir(), `${id}.json`);
}

function syncQueuePath(): string {
  return path.join(dataDir(), "sync-queue.json");
}

function statisticsPath(versionPath: string): string {
  return path.join(versionPath, "statistics.json");
}

function sessionsPath(versionPath: string): string {
  return path.join(versionPath, "sessions.json");
}

async function atomicWriteJSON(file: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(file));
  await writeJsonAtomic(file, data);
}

async function tryWriteJSON(file: string, data: unknown): Promise<boolean> {
  try {
    await atomicWriteJSON(file, data);
    return true;
  } catch (error) {
    console.error(`[statistics] ${file} could not be saved:`, error);
    reportFailure(error, { channel: "statistics:writeFailed" });
    return false;
  }
}

function corruptedDir(): string {
  return path.join(dataDir(), "corrupted");
}

function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

type LoadedFile =
  | { state: "missing" }
  | { state: "ok"; raw: string; value: unknown }
  | { state: "corrupt"; raw: string | null; error: unknown };

async function loadJSONFile(file: string): Promise<LoadedFile> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (error) {
    if (isMissingFileError(error)) return { state: "missing" };
    return { state: "corrupt", raw: null, error };
  }

  try {
    return { state: "ok", raw, value: JSON.parse(raw) };
  } catch (error) {
    return { state: "corrupt", raw, error };
  }
}

async function quarantineFile(file: string): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(corruptedDir(), `${path.basename(file)}.${stamp}`);

  try {
    await fs.ensureDir(corruptedDir());
    await fs.move(file, target, { overwrite: true });
    return target;
  } catch {
    return null;
  }
}

function reportCorruption(
  file: string,
  error: unknown,
  quarantined: string | null,
): void {
  console.error(
    quarantined
      ? `[statistics] ${file} is damaged, a copy was kept at ${quarantined}:`
      : `[statistics] ${file} is damaged and could not be set aside, it stays untouched:`,
    error,
  );
  reportFailure(error, { channel: "statistics:damagedFile" });
}

const SALVAGED_NUMBERS = [
  "playTime",
  "launches",
  "longestSessionSec",
  "crashes",
] as const;
const SALVAGED_DATES = ["lastLaunched", "firstLaunched"] as const;

function salvageAggregate(raw: string | null): Partial<VersionAggregate> | null {
  if (!raw) return null;
  const salvaged: Partial<VersionAggregate> = {};

  for (const field of SALVAGED_NUMBERS) {
    const match = new RegExp(
      `"${field}"\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*[,}]`,
    ).exec(raw);
    if (match) salvaged[field] = Number(match[1]);
  }

  for (const field of SALVAGED_DATES) {
    const match = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`).exec(raw);
    if (match) salvaged[field] = match[1];
  }

  return Object.keys(salvaged).length > 0 ? salvaged : null;
}

async function readAggregate(
  file: string,
): Promise<{ value: Partial<VersionAggregate> | null; writable: boolean }> {
  const loaded = await loadJSONFile(file);

  if (loaded.state === "missing") return { value: null, writable: true };
  if (loaded.state === "ok") {
    if (loaded.value && typeof loaded.value === "object" && !Array.isArray(loaded.value))
      return { value: loaded.value as VersionAggregate, writable: true };
    const quarantined = await quarantineFile(file);
    reportCorruption(file, new Error("not an object"), quarantined);
    return { value: null, writable: quarantined !== null };
  }

  const salvaged = salvageAggregate(loaded.raw);
  const quarantined = await quarantineFile(file);
  reportCorruption(file, loaded.error, quarantined);
  if (!quarantined) return { value: null, writable: false };
  return { value: salvaged, writable: true };
}

async function readJSONArray<T>(
  file: string,
): Promise<{ value: T[]; writable: boolean }> {
  const loaded = await loadJSONFile(file);

  if (loaded.state === "missing") return { value: [], writable: true };
  if (loaded.state === "ok" && Array.isArray(loaded.value))
    return { value: loaded.value as T[], writable: true };

  const error =
    loaded.state === "corrupt" ? loaded.error : new Error("not an array");
  const quarantined = await quarantineFile(file);
  reportCorruption(file, error, quarantined);
  return { value: [], writable: quarantined !== null };
}

async function readJSONSafe<T>(file: string, fallback: T): Promise<T> {
  try {
    if (!(await fs.pathExists(file))) return fallback;
    return (await fs.readJSON(file)) as T;
  } catch {
    return fallback;
  }
}

function writeMarker(session: ActiveSession, lastSeen: number): Promise<void> {
  const previous = markerWrites.get(session.id) ?? Promise.resolve();
  const next = previous.then(async () => {
    if (endedSessionIds.has(session.id)) return;

    const marker: PendingMarker = { ...session, lastSeen };
    try {
      await atomicWriteJSON(markerPath(session.id), marker);
    } catch {}
  });

  markerWrites.set(session.id, next);
  return next;
}

function ensureHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const session of activeSessions.values()) {
      void writeMarker(session, now);
    }
  }, HEARTBEAT_MS);
  heartbeatTimer.unref?.();
}

function stopHeartbeatIfIdle(): void {
  if (heartbeatTimer && activeSessions.size === 0) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function enqueueSync(entry: IPlaytimeSyncEntry): Promise<void> {
  await withLock(syncQueuePath(), async () => {
    const queue = await readJSONArray<IPlaytimeSyncEntry>(syncQueuePath());
    if (!queue.writable) return;
    queue.value.push(entry);
    await tryWriteJSON(syncQueuePath(), queue.value);
  });
}

async function recordSession(
  ctx: SessionContext & { server?: string },
  session: IVersionSession,
): Promise<void> {
  if (ctx.accountSub && session.durationSec > 0) {
    await enqueueSync({
      id: session.id,
      sub: ctx.accountSub,
      seconds: session.durationSec,
      createdAt: session.endedAt,
    });
  }

  if (!ctx.trackStatistics) return;

  await withLock(ctx.versionPath, async () => {
    const aggregate = await readAggregate(statisticsPath(ctx.versionPath));

    if (aggregate.writable) {
      const agg = aggregate.value ?? {};
      const next: VersionAggregate = {
        playTime: (agg.playTime || 0) + session.durationSec,
        launches: (agg.launches || 0) + 1,
        lastLaunched: session.endedAt,
        firstLaunched: agg.firstLaunched || session.startedAt,
        longestSessionSec: Math.max(
          agg.longestSessionSec || 0,
          session.durationSec,
        ),
        crashes: (agg.crashes || 0) + (session.crashed ? 1 : 0),
      };
      await tryWriteJSON(statisticsPath(ctx.versionPath), next);
    }

    const sessions = await readJSONArray<IVersionSession>(
      sessionsPath(ctx.versionPath),
    );
    if (!sessions.writable) return;
    sessions.value.push(session);
    await tryWriteJSON(
      sessionsPath(ctx.versionPath),
      sessions.value.slice(-SESSIONS_LIMIT),
    );
  });
}

export function beginSession(ctx: SessionContext): string {
  const session: ActiveSession = {
    ...ctx,
    id: randomUUID(),
    spawnedAt: Date.now(),
    readyAt: null,
    spawnedMono: performance.now(),
    readyMono: null,
  };
  activeSessions.set(makeKey(ctx.versionName, ctx.instance), session);
  ensureHeartbeat();
  void writeMarker(session, session.spawnedAt);
  return session.id;
}

export function markSessionReady(versionName: string, instance: number): void {
  const session = activeSessions.get(makeKey(versionName, instance));
  if (!session || session.readyAt) return;
  session.readyAt = Date.now();
  session.readyMono = performance.now();
  void writeMarker(session, session.readyAt);
}

export function setSessionServer(
  versionName: string,
  instance: number,
  server: string,
): void {
  const session = activeSessions.get(makeKey(versionName, instance));
  if (!session) return;
  session.server = server;
}

export async function endSession(
  versionName: string,
  instance: number,
  exitCode: number,
  options?: { recovered?: boolean },
): Promise<void> {
  const key = makeKey(versionName, instance);
  const session = activeSessions.get(key);
  activeSessions.delete(key);
  stopHeartbeatIfIdle();
  if (!session) return;

  endedSessionIds.add(session.id);
  await markerWrites.get(session.id)?.catch(() => {});
  markerWrites.delete(session.id);

  try {
    await fs.remove(markerPath(session.id));
  } catch {
    // ignore
  } finally {
    endedSessionIds.delete(session.id);
  }

  const endedAtMs = Date.now();
  const reached = session.readyAt != null;
  const startMs = session.readyAt ?? session.spawnedAt;

  const elapsedSec = Math.max(
    0,
    Math.floor((performance.now() - (session.readyMono ?? session.spawnedMono)) / 1000),
  );
  const rawDurationSec = reached
    ? elapsedSec
    : Math.max(0, elapsedSec - LAUNCH_LAG_SECONDS);
  const durationSec = Math.min(MAX_SESSION_SECONDS, rawDurationSec);

  await recordSession(session, {
    id: session.id,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    durationSec,
    exitCode,
    crashed: exitCode !== 0,
    recovered: options?.recovered ? true : undefined,
    account: session.accountLabel,
    server: session.server,
  });
}

export async function reconcilePendingSessions(): Promise<void> {
  let files: string[] = [];
  try {
    if (!(await fs.pathExists(pendingDir()))) return;
    files = (await fs.readdir(pendingDir())).filter((f) =>
      f.endsWith(".json"),
    );
  } catch {
    return;
  }

  for (const file of files) {
    const full = path.join(pendingDir(), file);
    const marker = await readJSONSafe<PendingMarker | null>(full, null);
    try {
      await fs.remove(full);
    } catch {
      // ignore
    }
    if (!marker || !marker.id) continue;
    if (activeSessions.has(makeKey(marker.versionName, marker.instance)))
      continue;

    if (marker.readyAt == null) continue;

    const startMs = marker.readyAt;
    const endMs = Math.max(marker.lastSeen || startMs, startMs);
    const durationSec = Math.min(
      MAX_SESSION_SECONDS,
      Math.max(0, Math.floor((endMs - startMs) / 1000)),
    );
    if (durationSec <= 0) continue;

    await recordSession(marker, {
      id: marker.id,
      startedAt: new Date(startMs).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      durationSec,
      exitCode: 0,
      crashed: false,
      recovered: true,
      account: marker.accountLabel,
      server: marker.server,
    });
  }
}

export async function readSyncQueue(): Promise<IPlaytimeSyncEntry[]> {
  return (await readJSONArray<IPlaytimeSyncEntry>(syncQueuePath())).value;
}

export async function resolveSyncEntries(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const set = new Set(ids);
  await withLock(syncQueuePath(), async () => {
    const queue = await readJSONArray<IPlaytimeSyncEntry>(syncQueuePath());
    if (!queue.writable) return;
    await tryWriteJSON(
      syncQueuePath(),
      queue.value.filter((entry) => !set.has(entry.id)),
    );
  });
}
