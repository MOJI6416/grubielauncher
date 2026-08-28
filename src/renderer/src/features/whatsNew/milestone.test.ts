import { describe, expect, it } from "vitest";
import type { ILauncherReleaseNote } from "@/types/LauncherRelease";
import {
  MILESTONE_FEED_WINDOW_MS,
  isMilestoneRelease,
  showMilestoneInFeed,
} from "./milestone";

const NOW = Date.UTC(2026, 7, 20, 12, 0, 0);

function note(overrides: Partial<ILauncherReleaseNote> = {}): ILauncherReleaseNote {
  return {
    version: "2.0.0",
    title: "Grubie Launcher 2.0",
    subtitle: "",
    highlights: [],
    fixes: [],
    discordCta: "",
    discordUrl: "",
    isMilestone: true,
    publishedAt: new Date(NOW - 3600_000).toISOString(),
    ...overrides,
  };
}

describe("milestone release", () => {
  it("treats a missing or non-milestone release as ordinary", () => {
    expect(isMilestoneRelease(null)).toBe(false);
    expect(isMilestoneRelease(undefined)).toBe(false);
    expect(isMilestoneRelease(note({ isMilestone: false }))).toBe(false);
    expect(
      isMilestoneRelease({ ...note(), isMilestone: undefined as never }),
    ).toBe(false);
  });

  it("keeps a fresh milestone in the feed and drops a stale one", () => {
    expect(showMilestoneInFeed(note(), NOW)).toBe(true);

    const edge = note({
      publishedAt: new Date(NOW - MILESTONE_FEED_WINDOW_MS).toISOString(),
    });
    expect(showMilestoneInFeed(edge, NOW)).toBe(true);

    const stale = note({
      publishedAt: new Date(NOW - MILESTONE_FEED_WINDOW_MS - 1000).toISOString(),
    });
    expect(showMilestoneInFeed(stale, NOW)).toBe(false);
  });

  it("shows a milestone with no usable date rather than hiding it", () => {
    expect(showMilestoneInFeed(note({ publishedAt: null }), NOW)).toBe(true);
    expect(showMilestoneInFeed(note({ publishedAt: "nonsense" }), NOW)).toBe(
      true,
    );
  });

  it("never shows an ordinary release in the feed", () => {
    expect(showMilestoneInFeed(note({ isMilestone: false }), NOW)).toBe(false);
    expect(showMilestoneInFeed(null, NOW)).toBe(false);
  });

  it("tolerates a clock that is behind the publish date", () => {
    expect(showMilestoneInFeed(note(), NOW - 7 * 24 * 3600_000)).toBe(true);
  });
});
