import { DownloaderFailuresInfo } from "@/types/Downloader";
import { VersionInstallOperation } from "@/types/InstallationProgress";
import { Loader } from "@/types/Loader";

export type TaskOutcome = "done" | "partial" | "cancelled" | "failed";

export interface TaskRecord {
  id: string;
  versionName: string;
  loaderName: Loader;
  operation: VersionInstallOperation;
  outcome: TaskOutcome;
  startedAt: number;
  finishedAt: number;
  bytes: number;
  files: number;
  failedFiles: number;
  failures?: DownloaderFailuresInfo;
}

export const HISTORY_LIMIT = 6;

const MERGE_WINDOW_MS = 4000;
const PATCH_WINDOW_MS = 5000;

const OUTCOME_RANK: Record<TaskOutcome, number> = {
  done: 0,
  partial: 1,
  cancelled: 2,
  failed: 3,
};

export function resolveOutcome(input: {
  cancelled: boolean;
  failedFiles: number;
}): TaskOutcome {
  if (input.cancelled) return "cancelled";
  return input.failedFiles > 0 ? "partial" : "done";
}

export function worstOutcome(left: TaskOutcome, right: TaskOutcome) {
  return OUTCOME_RANK[right] > OUTCOME_RANK[left] ? right : left;
}

function mergeRecords(previous: TaskRecord, next: TaskRecord): TaskRecord {
  return {
    ...previous,
    outcome: worstOutcome(previous.outcome, next.outcome),
    finishedAt: next.finishedAt,
    bytes: previous.bytes + next.bytes,
    files: previous.files + next.files,
    failedFiles: previous.failedFiles + next.failedFiles,
    failures: next.failures ?? previous.failures,
  };
}

export function pushTaskRecord(
  history: TaskRecord[],
  record: TaskRecord,
  limit = HISTORY_LIMIT,
): TaskRecord[] {
  const previous = history[0];

  if (
    previous &&
    previous.versionName === record.versionName &&
    record.startedAt - previous.finishedAt < MERGE_WINDOW_MS
  ) {
    return [mergeRecords(previous, record), ...history.slice(1)].slice(0, limit);
  }

  return [record, ...history.filter((item) => item.id !== record.id)].slice(
    0,
    limit,
  );
}

export function patchLatestOutcome(
  history: TaskRecord[],
  outcome: TaskOutcome,
  now: number,
  maxAgeMs = PATCH_WINDOW_MS,
): TaskRecord[] {
  const latest = history[0];
  if (!latest || now - latest.finishedAt > maxAgeMs) return history;
  if (latest.outcome === outcome) return history;

  return [{ ...latest, outcome }, ...history.slice(1)];
}

export function taskDuration(record: TaskRecord): number {
  return Math.max(0, record.finishedAt - record.startedAt);
}

export function shouldCelebrate(record: TaskRecord): boolean {
  return record.outcome === "done" && taskDuration(record) > 15000;
}
