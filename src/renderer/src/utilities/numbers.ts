import i18n from "@renderer/i18n";

export function playerLocale(): string {
  return i18n.resolvedLanguage || i18n.language || "en";
}

export function formatNumber(
  value: number,
  lang: string = playerLocale(),
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(lang || "en", options).format(value);
  } catch {
    return String(value);
  }
}

export function formatCompactNumber(
  value: number | undefined | null,
  lang: string = playerLocale(),
): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;

  return formatNumber(value, lang, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}
