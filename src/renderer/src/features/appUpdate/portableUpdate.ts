import { SITE_URL } from "@/shared/config";
import { compareLauncherVersions } from "@renderer/utilities/whatsNew";

export const PORTABLE_CHECK_DELAY_MS = 15 * 1000;
export const PORTABLE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

const SITE_LOCALES = ["en", "ru", "uk", "de", "es", "fr", "pl", "pt", "tr"];

export function portableDownloadUrl(locale: string | undefined): string {
  const language = (locale ?? "").toLowerCase().split("-")[0];
  const sitePath = SITE_LOCALES.includes(language) ? language : "en";
  return `${SITE_URL}/${sitePath}/download`;
}

export function pickPortableUpdate(
  current: string | null | undefined,
  latest: string | null | undefined,
  dismissed: string | null | undefined,
): string | null {
  if (!current || !latest) return null;
  if (compareLauncherVersions(latest, current) <= 0) return null;
  if (dismissed && compareLauncherVersions(latest, dismissed) <= 0) return null;
  return latest;
}
