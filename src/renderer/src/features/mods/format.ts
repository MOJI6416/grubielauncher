export function formatCompactNumber(
  value: number | undefined | null,
  lang: string,
): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;

  try {
    return new Intl.NumberFormat(lang || "en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(
  value: string | undefined | null,
  lang: string,
): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    return new Intl.DateTimeFormat(lang || "en", { dateStyle: "medium" }).format(
      date,
    );
  } catch {
    return date.toLocaleDateString();
  }
}

export function relativeDays(value: string | undefined | null, now = Date.now()) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return Math.floor((now - date.getTime()) / 86_400_000);
}
