import type {
  IModpackAnalyticsBuild,
  IModpackAnalyticsDay,
} from "@/types/Backend";

export const ANALYTICS_DAYS = 30;
export const MIN_SESSIONS_FOR_RATE = 5;

export type CrashLevel = "ok" | "warn" | "bad";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function fillDays(
  days: IModpackAnalyticsDay[],
  count = ANALYTICS_DAYS,
  now = new Date(),
): IModpackAnalyticsDay[] {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const filled: IModpackAnalyticsDay[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const key = dayKey(new Date(now.getTime() - offset * DAY_MS));
    filled.push(
      byDay.get(key) ?? {
        day: key,
        installs: 0,
        players: 0,
        sessions: 0,
        crashes: 0,
        playSeconds: 0,
      },
    );
  }
  return filled;
}

export function crashRate(crashes: number, sessions: number): number | null {
  if (!Number.isFinite(sessions) || sessions <= 0) return null;
  return Math.min(1, Math.max(0, crashes / sessions));
}

export function crashLevel(rate: number | null): CrashLevel {
  if (rate == null || rate < 0.05) return "ok";
  return rate < 0.2 ? "warn" : "bad";
}

export function crashTotals(builds: IModpackAnalyticsBuild[]): {
  sessions: number;
  crashes: number;
} {
  return builds.reduce(
    (sum, build) => ({
      sessions: sum.sessions + build.sessions,
      crashes: sum.crashes + build.crashes,
    }),
    { sessions: 0, crashes: 0 },
  );
}

export function isRateReliable(sessions: number): boolean {
  return sessions >= MIN_SESSIONS_FOR_RATE;
}

export function toPercent(rate: number): number {
  return Math.round(rate * 1000) / 10;
}

export type DayMetric = "players" | "installs" | "playSeconds";

export function dayValue(day: IModpackAnalyticsDay, metric: DayMetric): number {
  return day[metric];
}
