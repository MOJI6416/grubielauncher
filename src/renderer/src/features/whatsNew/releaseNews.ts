import type { INews } from "@/types/News";
import type { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { SITE_URL } from "@/shared/config";

const RELEASE_NEWS_PREFIX = "grubie-release:";

export function releaseNewsId(version: string): string {
  return `${RELEASE_NEWS_PREFIX}${version}`;
}

export function releaseNewsUrl(version: string, locale: string): string {
  const language = (locale || "en").split("-")[0];
  return `${SITE_URL}/${language}/changelog#v${version}`;
}

export function releaseTime(release: ILauncherReleaseNote): number {
  const published = release.publishedAt
    ? new Date(release.publishedAt).getTime()
    : Number.NaN;

  return Number.isFinite(published) ? Math.floor(published / 1000) : 0;
}

export function releaseToNewsItem(
  release: ILauncherReleaseNote | null | undefined,
  locale: string,
): INews | null {
  const version = String(release?.version ?? "").trim();
  if (!release || !version) return null;

  return {
    id: releaseNewsId(version),
    title: release.title || `Grubie Launcher ${version}`,
    url: releaseNewsUrl(version, locale),
    author: "",
    image: "",
    imageAltText: "",
    description: release.subtitle || "",
    time: releaseTime(release),
    tags: [],
  };
}

export function releasesToNewsItems(
  releases: readonly (ILauncherReleaseNote | null | undefined)[],
  locale: string,
): INews[] {
  const items: INews[] = [];

  for (const release of releases) {
    const item = releaseToNewsItem(release, locale);
    if (item) items.push(item);
  }

  return items;
}

export function releasesById(
  releases: readonly ILauncherReleaseNote[],
): Map<string, ILauncherReleaseNote> {
  const map = new Map<string, ILauncherReleaseNote>();

  for (const release of releases) {
    const version = String(release?.version ?? "").trim();
    if (version) map.set(releaseNewsId(version), release);
  }

  return map;
}
