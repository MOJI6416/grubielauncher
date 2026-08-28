import { describe, expect, it, vi } from "vitest";
import {
  compareLauncherVersions,
  getWhatsNewDecision,
  markWhatsNewSeen,
} from "./whatsNew";

describe("whats new launcher state helpers", () => {
  it("does not show on first launch", () => {
    expect(getWhatsNewDecision("1.7.2", null)).toEqual({
      type: "firstLaunch",
      shouldShow: false,
    });
  });

  it("shows only when current version is newer than the last seen version", () => {
    expect(getWhatsNewDecision("1.7.2", {
      whatsNew: { lastSeenVersion: "1.7.0" },
    })).toEqual({
      type: "updated",
      shouldShow: true,
    });

    expect(getWhatsNewDecision("1.7.2", {
      whatsNew: { lastSeenVersion: "1.7.2" },
    })).toEqual({
      type: "sameVersion",
      shouldShow: false,
    });
  });

  it("compares semantic version parts numerically", () => {
    expect(compareLauncherVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareLauncherVersions("1.7.0", "1.7.2")).toBe(-1);
    expect(compareLauncherVersions("1.7.0", "1.7.0")).toBe(0);
  });

  it("ranks a release above its own pre-releases", () => {
    expect(compareLauncherVersions("2.0.0", "2.0.0-beta.1")).toBe(1);
    expect(compareLauncherVersions("2.0.0-beta.1", "2.0.0")).toBe(-1);
    expect(compareLauncherVersions("2.0.0-beta.2", "2.0.0-beta.1")).toBe(1);
    expect(compareLauncherVersions("2.0.0-beta.1", "2.0.0-beta.1")).toBe(0);
    expect(compareLauncherVersions("2.0.0-rc.1", "2.0.0-beta.9")).toBe(1);
    expect(compareLauncherVersions("2.0.0-beta.10", "2.0.0-beta.9")).toBe(1);
    expect(compareLauncherVersions("2.0.1", "2.0.0")).toBe(1);
    expect(compareLauncherVersions("2.0.0+build.7", "2.0.0")).toBe(0);
  });

  it("shows what is new to a beta tester on the release build", () => {
    expect(
      getWhatsNewDecision("2.0.0", {
        whatsNew: { lastSeenVersion: "2.0.0-beta.3" },
      }),
    ).toEqual({ type: "updated", shouldShow: true });
  });

  it("marks the current version as seen without dropping unrelated state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00.000Z"));

    expect(markWhatsNewSeen("1.7.2", { whatsNew: {}, other: true } as any))
      .toEqual({
        whatsNew: {
          lastSeenVersion: "1.7.2",
          updatedAt: "2026-05-24T12:00:00.000Z",
        },
        other: true,
      });

    vi.useRealTimers();
  });
});
