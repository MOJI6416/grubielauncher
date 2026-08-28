import { describe, expect, it } from "vitest";
import {
  connectionsSummary,
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_EVENTS,
} from "./notificationPrefs";

const prefs = (overrides: Partial<typeof DEFAULT_NOTIFICATION_PREFS> = {}) => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  ...overrides,
});

describe("connectionsSummary", () => {
  it("offers everything when nothing is connected", () => {
    expect(
      connectionsSummary({
        hasDiscord: false,
        hasTelegram: false,
        prefs: prefs(),
      }),
    ).toBe("empty");
  });

  it("offers Telegram to someone who only signed in with Discord", () => {
    expect(
      connectionsSummary({
        hasDiscord: true,
        hasTelegram: false,
        prefs: prefs(),
      }),
    ).toBe("telegramOffer");
  });

  it("says what Telegram is for once it is connected", () => {
    expect(
      connectionsSummary({
        hasDiscord: true,
        hasTelegram: true,
        prefs: prefs(),
      }),
    ).toBe("notifications");
  });

  it("shows the muted state after /stop in the bot", () => {
    expect(
      connectionsSummary({
        hasDiscord: false,
        hasTelegram: true,
        prefs: prefs({ enabled: false }),
      }),
    ).toBe("muted");
  });

  it("shows the muted state when every event switch is off", () => {
    expect(
      connectionsSummary({
        hasDiscord: false,
        hasTelegram: true,
        prefs: prefs({
          gameInvite: false,
          friendRequest: false,
          worldShare: false,
        }),
      }),
    ).toBe("muted");
  });

  it("is not muted while one event is still on", () => {
    for (const event of NOTIFICATION_EVENTS) {
      const off = {
        gameInvite: false,
        friendRequest: false,
        worldShare: false,
      };

      expect(
        connectionsSummary({
          hasDiscord: false,
          hasTelegram: true,
          prefs: prefs({ ...off, [event]: true }),
        }),
      ).toBe("notifications");
    }
  });
});
