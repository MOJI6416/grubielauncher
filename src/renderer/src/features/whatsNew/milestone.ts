import type { ILauncherReleaseNote } from "@/types/LauncherRelease";

export const MILESTONE_FEED_WINDOW_MS = 14 * 24 * 3600_000;

export function isMilestoneRelease(
  release: ILauncherReleaseNote | null | undefined,
): boolean {
  return release?.isMilestone === true;
}

export function showMilestoneInFeed(
  release: ILauncherReleaseNote | null | undefined,
  now = Date.now(),
): boolean {
  if (!isMilestoneRelease(release)) return false;

  const published = release?.publishedAt
    ? new Date(release.publishedAt).getTime()
    : Number.NaN;
  if (Number.isNaN(published)) return true;

  const age = now - published;
  return age <= MILESTONE_FEED_WINDOW_MS;
}
