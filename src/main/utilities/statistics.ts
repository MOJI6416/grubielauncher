import { app } from "electron";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs-extra";
import {
  IPlaytimeSyncEntry,
  IVersionSession,
  IVersionStatistics,
} from "@/types/VersionStatistics";

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
  server?: string;
}

interface PendingMarker extends ActiveSession {
  lastSeen: number;
}

const SESSIONS_LIMIT = 500;
const HEARTBEAT_MS = 30_000;

const activeSessions = new Map<string, ActiveSession>();
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
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeJSON(tmp, data, { spaces: 2 });
  await fs.move(tmp, file, { overwrite: true });
}

async function readJSONSafe<T>(file: string, fallback: T): Promise<T> {
  try {
    if (!(await fs.pathExists(file))) return fallback;
    return (await fs.readJSON(file)) as T;
  } catch {
    return fallback;
  }
}

async function writeMarker(
  session: ActiveSession,
  lastSeen: number,
): Promise<void> {
  const marker: PendingMarker = { ...session, lastSeen };
  try {
    await atomicWriteJSON(markerPath(session.id), marker);
  } catch {
    // marker is best-effort crash-recovery metadata; ignore write failures
  }
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
    const queue = await readJSONSafe<IPlaytimeSyncEntry[]>(syncQueuePath(), []);
    queue.push(entry);
    await atomicWriteJSON(syncQueuePath(), queue);
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
    const agg = await readJSONSafe<VersionAggregate>(
      statisticsPath(ctx.versionPath),
      { playTime: 0, launches: 0, lastLaunched: session.endedAt },
    );

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
    await atomicWriteJSON(statisticsPath(ctx.versionPath), next);

    const sessions = await readJSONSafe<IVersionSession[]>(
      sessionsPath(ctx.versionPath),
      [],
    );
    sessions.push(session);
    await atomicWriteJSON(
      sessionsPath(ctx.versionPath),
      sessions.slice(-SESSIONS_LIMIT),
    );
  });
}

export function beginSession(ctx: SessionContext): string {
  const session: ActiveSession = {
    ...ctx,
    id: randomUUID(),
    spawnedAt: Date.now(),
    readyAt: null,
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
): Promise<void> {
  const key = makeKey(versionName, instance);
  const session = activeSessions.get(key);
  activeSessions.delete(key);
  stopHeartbeatIfIdle();
  if (!session) return;

  try {
    await fs.remove(markerPath(session.id));
  } catch {
    // ignore
  }

  const endedAtMs = Date.now();
  const reached = session.readyAt != null;
  const startMs = session.readyAt ?? session.spawnedAt;
  const durationSec = reached
    ? Math.max(0, Math.floor((endedAtMs - startMs) / 1000))
    : 0;

  await recordSession(session, {
    id: session.id,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    durationSec,
    exitCode,
    crashed: exitCode !== 0,
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
    const durationSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
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
  return readJSONSafe<IPlaytimeSyncEntry[]>(syncQueuePath(), []);
}

export async function resolveSyncEntries(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const set = new Set(ids);
  await withLock(syncQueuePath(), async () => {
    const queue = await readJSONSafe<IPlaytimeSyncEntry[]>(syncQueuePath(), []);
    await atomicWriteJSON(
      syncQueuePath(),
      queue.filter((entry) => !set.has(entry.id)),
    );
  });
}
