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
