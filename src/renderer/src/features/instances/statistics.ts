import { IVersionSession } from "@/types/VersionStatistics";

export type Bucket = { key: string; label: string; seconds: number; runs: number };

function durationOf(session: IVersionSession): number {
  return Number.isFinite(session.durationSec) && session.durationSec > 0
    ? session.durationSec
    : 0;
}

function accumulate(
  sessions: IVersionSession[],
  keyOf: (session: IVersionSession) => string | null,
): Map<string, { seconds: number; runs: number }> {
  const totals = new Map<string, { seconds: number; runs: number }>();

  for (const session of sessions) {
    const key = keyOf(session);
    if (key === null) continue;

    const current = totals.get(key) ?? { seconds: 0, runs: 0 };
    current.seconds += durationOf(session);
    current.runs += 1;
    totals.set(key, current);
  }

  return totals;
}

function toSortedBuckets(
  totals: Map<string, { seconds: number; runs: number }>,
  label: (key: string) => string,
): Bucket[] {
  return [...totals.entries()]
    .map(([key, value]) => ({ key, label: label(key), ...value }))
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}

export function playtimeByServer(
  sessions: IVersionSession[],
  singleplayerLabel: string,
): Bucket[] {
  const totals = accumulate(sessions, (session) => {
    const server = session.server?.trim();
    return server ? server : "";
  });

  return toSortedBuckets(totals, (key) => key || singleplayerLabel);
}

export function playtimeByAccount(sessions: IVersionSession[]): Bucket[] {
  const totals = accumulate(sessions, (session) => {
    const account = session.account?.trim();
    return account ? account : null;
  });

  return toSortedBuckets(totals, (key) => key);
}

export function hourHistogram(sessions: IVersionSession[]): number[] {
  const hours = new Array<number>(24).fill(0);

  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) continue;

    hours[started.getHours()] += durationOf(session);
  }

  return hours;
}

export function launchCleanRate(
  launches: number | null | undefined,
  crashes: number | null | undefined,
): number | null {
  const total = Math.floor(launches ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;

  const failed = Math.min(total, Math.max(0, Math.floor(crashes ?? 0) || 0));

  return Math.round(((total - failed) / total) * 100);
}

export function currentStreakDays(
  sessions: IVersionSession[],
  now = new Date(),
): number {
  const days = new Set<string>();

  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    days.add(started.toDateString());
  }

  let streak = 0;
  const cursor = new Date(now);

  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);

  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
