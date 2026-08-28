import type { IAchievementStats } from "@/types/Achievements";

export type WorldMetricUnit = "count" | "km" | "hours";

export interface WorldMetric {
  key: string;
  unit: WorldMetricUnit;
  value: number;
}

export interface InstancePlaytime {
  key: string;
  name: string;
  loader: string;
  playTime: number;
  launches: number;
}

const WORLD_METRICS: { key: keyof IAchievementStats; unit: WorldMetricUnit }[] =
  [
    { key: "playTimeTicks", unit: "hours" },
    { key: "distanceCm", unit: "km" },
    { key: "blocksMined", unit: "count" },
    { key: "mobKills", unit: "count" },
    { key: "diamondsMined", unit: "count" },
    { key: "itemsCrafted", unit: "count" },
    { key: "deaths", unit: "count" },
    { key: "worlds", unit: "count" },
  ];

export function buildWorldMetrics(stats: IAchievementStats): WorldMetric[] {
  return WORLD_METRICS.map(({ key, unit }) => ({
    key,
    unit,
    value: normalizeMetric(stats[key] ?? 0, unit),
  }));
}

export function hasWorldData(stats: IAchievementStats): boolean {
  return Object.values(stats).some((value) => Number(value) > 0);
}

export function favouriteInstance(
  list: readonly InstancePlaytime[],
): InstancePlaytime | null {
  let best: InstancePlaytime | null = null;

  for (const entry of list) {
    if (entry.playTime <= 0) continue;
    if (
      !best ||
      entry.playTime > best.playTime ||
      (entry.playTime === best.playTime && entry.launches > best.launches)
    ) {
      best = entry;
    }
  }

  return best;
}

export function reachPercentParts(percent: number): {
  belowFloor: boolean;
  value: number;
} {
  if (!Number.isFinite(percent) || percent <= 0) {
    return { belowFloor: false, value: 0 };
  }
  if (percent < 0.1) return { belowFloor: true, value: 0.1 };
  if (percent < 10) {
    return { belowFloor: false, value: Math.round(percent * 10) / 10 };
  }
  return { belowFloor: false, value: Math.round(percent) };
}

export function playedHours(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.floor(seconds / 3600);
}

export function accountAgeDays(createdAt: Date, now = Date.now()): number {
  const time = createdAt.getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((now - time) / 86_400_000));
}

function normalizeMetric(value: number, unit: WorldMetricUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (unit === "km") return Math.round((value / 100_000) * 10) / 10;
  if (unit === "hours") return Math.floor(value / 72_000);
  return Math.floor(value);
}
