import i18n from "@renderer/i18n";

function currentLocale(): string {
  return i18n.resolvedLanguage || i18n.language || "en";
}

export function formatDate(date: Date) {
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function formatDay(date: Date) {
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      dateStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

export function formatClock(date: Date) {
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function calendarDays(date: Date, now: Date): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
}

function calendarMonths(date: Date, now: Date): number {
  return (
    (date.getFullYear() - now.getFullYear()) * 12 +
    (date.getMonth() - now.getMonth())
  );
}

export function formatRelative(date: Date, now = Date.now()): string {
  if (Number.isNaN(date.getTime())) return "";

  const diff = date.getTime() - now;
  const absolute = Math.abs(diff);

  try {
    const formatter = new Intl.RelativeTimeFormat(currentLocale(), {
      numeric: "auto",
      style: "short",
    });

    if (absolute < MINUTE_MS) return formatter.format(0, "minute");
    if (absolute < HOUR_MS) {
      return formatter.format(Math.trunc(diff / MINUTE_MS), "minute");
    }
    if (absolute < DAY_MS) {
      return formatter.format(Math.trunc(diff / HOUR_MS), "hour");
    }

    const nowDate = new Date(now);
    const days = calendarDays(date, nowDate);
    const months = calendarMonths(date, nowDate);
    if (months === 0 || Math.abs(days) < 30) {
      return formatter.format(days, "day");
    }

    if (Math.abs(months) < 12) return formatter.format(months, "month");

    return formatter.format(date.getFullYear() - nowDate.getFullYear(), "year");
  } catch {
    return formatDay(date);
  }
}

export function formatTime(
  seconds: number,
  t: {
    h: string;
    m: string;
    s: string;
  },
): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs}${t.h}`);
  if (mins > 0) parts.push(`${mins}${t.m}`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs.toFixed(0)}${t.s}`);

  return parts.join(" ");
}
