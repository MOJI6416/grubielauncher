import { DownloaderInfo } from "@/types/Downloader";
import {
  VersionInstallOperation,
  VersionInstallStage,
} from "@/types/InstallationProgress";

export interface StageEvent {
  stage: VersionInstallStage;
  startedAt: number;
  endedAt?: number;
}

export interface DownloadStats {
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
  failed: number;
  percent: number;
}

const STAGE_LOG_LIMIT = 20;

export function clampPercent(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function appendStageEvent(
  log: StageEvent[],
  stage: VersionInstallStage,
  now: number,
): StageEvent[] {
  const last = log[log.length - 1];
  if (last && last.endedAt === undefined && last.stage === stage) return log;

  const next =
    last && last.endedAt === undefined
      ? [...log.slice(0, -1), { ...last, endedAt: now }]
      : log.slice();

  next.push({ stage, startedAt: now });

  return next.length > STAGE_LOG_LIMIT
    ? next.slice(next.length - STAGE_LOG_LIMIT)
    : next;
}

export function sealStageLog(log: StageEvent[], now: number): StageEvent[] {
  const last = log[log.length - 1];
  if (!last || last.endedAt !== undefined) return log;
  return [...log.slice(0, -1), { ...last, endedAt: now }];
}

export function stageElapsed(event: StageEvent, now: number): number {
  return Math.max(0, (event.endedAt ?? now) - event.startedAt);
}

export const STAGE_MIN_VISIBLE_MS = 420;

export interface PacedStage extends StageEvent {
  running: boolean;
}

export interface PacedStageLog {
  visible: PacedStage[];
  nextAt: number | null;
}

const CLIENT_STAGE_PLAN: VersionInstallStage[] = [
  "preparing",
  "manifest",
  "java",
  "loader",
  "assets",
  "files",
];

const SERVER_STAGE_PLAN: VersionInstallStage[] = [
  "preparing",
  "java",
  "files",
  "installer",
  "loader",
];

export function stagePlan(
  operation: VersionInstallOperation,
): VersionInstallStage[] {
  return operation === "server" ? SERVER_STAGE_PLAN : CLIENT_STAGE_PLAN;
}

export interface StageRow {
  key: string;
  stage: VersionInstallStage;
  state: "done" | "running" | "pending";
  event?: StageEvent;
}

export function buildStageRows(
  paced: PacedStage[],
  plan: VersionInstallStage[],
): StageRow[] {
  const rows: StageRow[] = [];
  let cursor = 0;

  for (const event of paced) {
    const planned = plan.indexOf(event.stage, cursor);
    if (planned !== -1) cursor = planned + 1;

    rows.push({
      key: `${event.stage}-${event.startedAt}`,
      stage: event.stage,
      state: event.running ? "running" : "done",
      event,
    });
  }

  for (const stage of plan.slice(cursor)) {
    rows.push({ key: `plan-${stage}`, stage, state: "pending" });
  }

  return rows;
}

export function paceStageLog(
  log: StageEvent[],
  now: number,
  minMs = STAGE_MIN_VISIBLE_MS,
): PacedStageLog {
  const visible: PacedStage[] = [];
  let nextAt: number | null = null;
  let cursor = log[0]?.startedAt ?? now;

  const remember = (time: number) => {
    if (time <= now) return;
    nextAt = nextAt === null ? time : Math.min(nextAt, time);
  };

  for (const event of log) {
    const displayStart = Math.max(event.startedAt, cursor);

    if (displayStart > now) {
      remember(displayStart);
      break;
    }

    const displayEnd =
      event.endedAt === undefined
        ? undefined
        : Math.max(event.endedAt, displayStart + minMs);

    const running = displayEnd === undefined || displayEnd > now;
    if (displayEnd !== undefined) remember(displayEnd);

    visible.push({ ...event, running });

    if (displayEnd === undefined) break;
    cursor = displayEnd;
  }

  return { visible, nextAt };
}

export function smoothSpeed(
  previous: number | null,
  sample: number | null | undefined,
  alpha = 0.35,
): number | null {
  if (typeof sample !== "number" || !Number.isFinite(sample) || sample <= 0) {
    return previous;
  }
  if (previous === null || previous <= 0) return sample;
  return previous + (sample - previous) * alpha;
}

export function estimateEta(
  info: DownloaderInfo | null,
  speed: number | null,
): number | null {
  if (!info) return null;

  if (info.totalBytes > 0 && speed !== null && speed > 0) {
    const remaining = info.totalBytes - info.downloadedBytes;
    if (remaining <= 0) return 0;
    return Math.round(remaining / speed);
  }

  const reported = info.estimatedTimeRemaining;
  if (typeof reported !== "number" || !Number.isFinite(reported)) return null;
  return reported > 0 ? Math.round(reported) : null;
}

export function buildDownloadStats(
  info: DownloaderInfo | null,
): DownloadStats | null {
  if (!info || info.totalItems <= 0) return null;

  const percent =
    info.totalBytes > 0
      ? clampPercent((info.downloadedBytes / info.totalBytes) * 100)
      : clampPercent((info.completedItems / info.totalItems) * 100);

  return {
    filesDone: info.completedItems,
    filesTotal: info.totalItems,
    bytesDone: info.downloadedBytes,
    bytesTotal: info.totalBytes,
    failed: info.failedItems,
    percent,
  };
}

export interface BatchTotal {
  carried: number;
  current: number;
  key: number;
}

export const EMPTY_BATCH_TOTAL: BatchTotal = {
  carried: 0,
  current: 0,
  key: -1,
};

export function accumulateBatch(
  total: BatchTotal,
  value: number,
  key: number,
): BatchTotal {
  if (!Number.isFinite(value) || value < 0) return total;

  if (key !== total.key) {
    return { carried: total.carried + total.current, current: value, key };
  }

  return {
    carried: total.carried,
    current: Math.max(total.current, value),
    key,
  };
}

export function batchTotalValue(total: BatchTotal): number {
  return total.carried + total.current;
}

export function formatByteRange(
  done: number,
  total: number,
  sizes: string[],
): string {
  const step = 1024;
  const raw = total > 0 ? Math.floor(Math.log(total) / Math.log(step)) : 0;
  const unit = Math.max(
    0,
    Math.min(sizes.length - 1, Number.isFinite(raw) ? raw : 0),
  );
  const scale = Math.pow(step, unit);

  const render = (value: number) => {
    const scaled = Math.max(0, value) / scale;
    return String(parseFloat(scaled.toFixed(scaled >= 100 ? 0 : 1)));
  };

  return `${render(done)} / ${render(total)} ${sizes[unit]}`;
}

export function stripGroupPrefix(name: string | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  const match = /^\[[^\]]*\]\s*(.+)$/.exec(trimmed);
  return (match ? match[1] : trimmed).trim();
}

export function formatSeconds(seconds: number, units: string[]): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";

  const total = Math.round(seconds);
  if (total < 60) return `${total}${units[0]}`;
  if (total < 3600) {
    return `${Math.floor(total / 60)}${units[1]} ${total % 60}${units[0]}`;
  }

  return `${Math.floor(total / 3600)}${units[2]} ${Math.floor(
    (total % 3600) / 60,
  )}${units[1]}`;
}

export function formatElapsed(ms: number, units: string[]): string {
  if (!Number.isFinite(ms) || ms < 100) return "";

  const seconds = ms / 1000;
  if (seconds < 10) return `${Math.round(seconds * 10) / 10}${units[0]}`;
  return formatSeconds(seconds, units);
}
