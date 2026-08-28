import {
  DownloaderFailureItem,
  DownloaderFailuresInfo,
} from "@/types/Downloader";
import { FailureCause, FailureInfo, classifyError } from "@/shared/errors";

const RETRYABLE_CAUSES = new Set<FailureCause>([
  "offline",
  "dns",
  "refused",
  "timeout",
  "reset",
  "tls",
  "rateLimited",
  "serverError",
  "conflict",
  "checksum",
  "downloadFailed",
  "fileBusy",
  "unknown",
]);

const REPORT_FILE_LIMIT = 12;

export interface FailureGroup {
  key: string;
  code: string;
  cause: FailureCause;
  info: FailureInfo;
  items: DownloaderFailureItem[];
  retryable: boolean;
}

export function isRetryableCause(cause: FailureCause): boolean {
  return RETRYABLE_CAUSES.has(cause);
}

export function groupFailures(
  failures: DownloaderFailureItem[],
): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();

  for (const failure of failures) {
    const info = classifyError(failure.error, { url: failure.url });
    const key = `${info.code}|${info.host ?? ""}`;
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(failure);
      continue;
    }

    groups.set(key, {
      key,
      code: info.code,
      cause: info.cause,
      info,
      items: [failure],
      retryable: isRetryableCause(info.cause),
    });
  }

  return [...groups.values()].sort((left, right) => {
    if (left.retryable !== right.retryable) return left.retryable ? 1 : -1;
    if (right.items.length !== left.items.length) {
      return right.items.length - left.items.length;
    }
    return left.key.localeCompare(right.key);
  });
}

export function mergeFailures(
  previous: DownloaderFailuresInfo | null,
  incoming: DownloaderFailuresInfo,
): DownloaderFailuresInfo {
  if (!previous) return incoming;

  const seen = new Set(
    previous.failures.map((item) => `${item.destination}|${item.url}`),
  );
  const added = incoming.failures.filter(
    (item) => !seen.has(`${item.destination}|${item.url}`),
  );

  return {
    totalItems: previous.totalItems + incoming.totalItems,
    completedItems: previous.completedItems + incoming.completedItems,
    failedItems: previous.failures.length + added.length,
    failures: [...previous.failures, ...added],
    versionName: incoming.versionName ?? previous.versionName,
  };
}

export function countRetryable(groups: FailureGroup[]): number {
  return groups.reduce(
    (total, group) => (group.retryable ? total + group.items.length : total),
    0,
  );
}

export function buildFailureReport(
  info: DownloaderFailuresInfo,
  groups: FailureGroup[],
): string {
  const lines: string[] = [];

  if (info.versionName) lines.push(`version: ${info.versionName}`);
  lines.push(
    `files: ${info.completedItems}/${info.totalItems}, failed: ${info.failedItems}`,
  );

  for (const group of groups) {
    lines.push("");
    lines.push(
      `[${group.code}] x${group.items.length}${
        group.info.host ? ` — ${group.info.host}` : ""
      }`,
    );

    for (const item of group.items.slice(0, REPORT_FILE_LIMIT)) {
      lines.push(`  ${item.group}/${item.fileName} — ${item.error}`);
    }

    if (group.items.length > REPORT_FILE_LIMIT) {
      lines.push(`  … +${group.items.length - REPORT_FILE_LIMIT}`);
    }
  }

  return lines.join("\n");
}
