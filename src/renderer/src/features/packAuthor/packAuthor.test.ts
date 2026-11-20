import { describe, expect, it } from "vitest";
import {
  crashLevel,
  crashRate,
  crashTotals,
  fillDays,
  isRateReliable,
  toPercent,
} from "./packAnalytics";
import {
  channelErrorKey,
  hasChannelContent,
  isUnread,
  newestAnnouncementAt,
  sameChannelField,
} from "./packChannel";

describe("pack analytics", () => {
  it("fills the last 30 UTC days and keeps the reported ones", () => {
    const now = new Date("2026-11-19T10:00:00Z");
    const days = fillDays(
      [
        {
          day: "2026-11-18",
          installs: 2,
          players: 3,
          sessions: 4,
          crashes: 1,
          playSeconds: 600,
        },
        {
          day: "2026-09-01",
          installs: 9,
          players: 9,
          sessions: 9,
          crashes: 9,
          playSeconds: 9,
        },
      ],
      30,
      now,
    );

    expect(days).toHaveLength(30);
    expect(days[0].day).toBe("2026-10-21");
    expect(days[29].day).toBe("2026-11-19");
    expect(days[28]).toMatchObject({ day: "2026-11-18", players: 3 });
    expect(days[29]).toMatchObject({ players: 0, installs: 0 });
  });

  it("gives no crash rate without sessions and grades the rest", () => {
    expect(crashRate(0, 0)).toBeNull();
    expect(crashRate(3, 10)).toBe(0.3);
    expect(crashLevel(null)).toBe("ok");
    expect(crashLevel(0.04)).toBe("ok");
    expect(crashLevel(0.1)).toBe("warn");
    expect(crashLevel(0.3)).toBe("bad");
    expect(toPercent(1 / 3)).toBe(33.3);
  });

  it("sums sessions and crashes over builds", () => {
    expect(
      crashTotals([
        {
          build: 2,
          installs: 1,
          sessions: 10,
          crashes: 2,
          playSeconds: 0,
          activePlayers: 0,
          since: null,
        },
        {
          build: 1,
          installs: 1,
          sessions: 4,
          crashes: 1,
          playSeconds: 0,
          activePlayers: 0,
          since: null,
        },
      ]),
    ).toEqual({ sessions: 14, crashes: 3 });
    expect(isRateReliable(4)).toBe(false);
    expect(isRateReliable(5)).toBe(true);
  });
});

describe("pack channel", () => {
  const channel = {
    server: null,
    discord: null,
    announcements: [
      { id: "a", text: "old", createdAt: "2026-11-10T10:00:00.000Z" },
      { id: "b", text: "new", createdAt: "2026-11-18T10:00:00.000Z" },
    ],
  };

  it("knows when there is something to show", () => {
    expect(hasChannelContent(null)).toBe(false);
    expect(
      hasChannelContent({ server: null, discord: null, announcements: [] }),
    ).toBe(false);
    expect(
      hasChannelContent({ server: "a.b", discord: null, announcements: [] }),
    ).toBe(true);
    expect(hasChannelContent(channel)).toBe(true);
  });

  it("marks an announcement newer than the last seen one as new", () => {
    const newest = newestAnnouncementAt(channel);
    expect(newest).toBe("2026-11-18T10:00:00.000Z");
    expect(isUnread(newest, null)).toBe(true);
    expect(isUnread(newest, "2026-11-18T10:00:00.000Z")).toBe(false);
    expect(isUnread(newest, "2026-11-12T00:00:00.000Z")).toBe(true);
    expect(isUnread(null, null)).toBe(false);
  });

  it("maps server error codes to texts", () => {
    expect(channelErrorKey("invalid_server")).toBe(
      "packAuthor.errors.invalidServer",
    );
    expect(channelErrorKey("http_500")).toBe("packAuthor.errors.generic");
  });

  it("compares a draft field with the saved value", () => {
    expect(sameChannelField("  ", null)).toBe(true);
    expect(sameChannelField(" a.b ", "a.b")).toBe(true);
    expect(sameChannelField("a.c", "a.b")).toBe(false);
  });
});
