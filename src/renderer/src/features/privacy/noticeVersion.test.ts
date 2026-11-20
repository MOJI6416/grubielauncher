import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "@/types/Settings";
import { SETTINGS_ENTRIES } from "@renderer/features/settings/catalog";
import {
  PRIVACY_NOTICE_ROWS,
  PRIVACY_NOTICE_VERSION,
  markPrivacyNoticeSeen,
  privacyNoticePatch,
  shouldShowPrivacyNotice,
} from "./noticeVersion";

describe("privacy notice", () => {
  it("shows to a new player and once more to those who closed the old card", () => {
    expect(shouldShowPrivacyNotice(null)).toBe(true);
    expect(shouldShowPrivacyNotice({})).toBe(true);
    expect(shouldShowPrivacyNotice({ privacyNoticeSeen: true })).toBe(true);
    expect(
      shouldShowPrivacyNotice({
        privacyNoticeSeen: true,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      }),
    ).toBe(false);
  });

  it("is not shown again after it is closed, and keeps the rest of the state", () => {
    const state = markPrivacyNoticeSeen({
      privacyNoticeSeen: true,
      onboardingDone: true,
    });
    expect(state.onboardingDone).toBe(true);
    expect(shouldShowPrivacyNotice(state)).toBe(false);
  });

  it("offers the statistics for modpack authors next to the anonymous two", () => {
    expect(PRIVACY_NOTICE_ROWS.map((row) => row.key)).toEqual([
      "crashTelemetry",
      "usageStats",
      "packAnalytics",
    ]);
    for (const row of PRIVACY_NOTICE_ROWS) {
      expect(DEFAULT_SETTINGS[row.key]).toBe(true);
    }
  });

  it("writes the very settings the Privacy section switches", () => {
    const privacyKeys = SETTINGS_ENTRIES.filter(
      (entry) => entry.section === "privacy",
    ).flatMap((entry) => entry.keys);

    for (const row of PRIVACY_NOTICE_ROWS) {
      expect(privacyKeys).toContain(row.key);
      const patch = privacyNoticePatch(row.key, false);
      expect(patch).toEqual({ [row.key]: false });
      expect(normalizeSettings({ ...DEFAULT_SETTINGS, ...patch })[row.key]).toBe(
        false,
      );
    }
  });
});
