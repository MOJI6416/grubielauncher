import {
  isUsageFeature,
  USAGE_MAX_AGE_DAYS,
  USAGE_MAX_PER_DAY,
} from "@/shared/usageFeatures";

export type UsageDays = Record<string, Record<string, number>>;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayTime(day: string): number {
  return Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
  );
}

export function normalizeUsageDays(value: unknown): UsageDays {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const days: UsageDays = {};
  for (const [day, counts] of Object.entries(value as Record<string, unknown>)) {
    if (!DAY_PATTERN.test(day)) continue;
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) continue;

    const clean: Record<string, number> = {};
    for (const [feature, raw] of Object.entries(counts)) {
      const count = Number(raw);
      if (!isUsageFeature(feature) || !Number.isSafeInteger(count) || count < 1)
        continue;
      clean[feature] = Math.min(count, USAGE_MAX_PER_DAY);
    }
    if (Object.keys(clean).length > 0) days[day] = clean;
  }
  return days;
}

export function addUse(days: UsageDays, feature: string, day: string): UsageDays {
  if (!isUsageFeature(feature) || !DAY_PATTERN.test(day)) return days;

  const counts = days[day] ?? {};
  const current = counts[feature] ?? 0;
  if (current >= USAGE_MAX_PER_DAY) return days;

  return { ...days, [day]: { ...counts, [feature]: current + 1 } };
}

export function finishedDays(days: UsageDays, today: string): string[] {
  const cutoff = dayTime(today) - USAGE_MAX_AGE_DAYS * DAY_MS;
  return Object.keys(days)
    .filter((day) => day < today && dayTime(day) >= cutoff)
    .sort();
}

export function dropStaleDays(days: UsageDays, today: string): UsageDays {
  const cutoff = dayTime(today) - USAGE_MAX_AGE_DAYS * DAY_MS;
  return Object.fromEntries(
    Object.entries(days).filter(
      ([day]) => dayTime(day) >= cutoff && day <= today,
    ),
  );
}

export function isRejectedReport(status: number | undefined): boolean {
  return status === 400 || status === 413;
}
