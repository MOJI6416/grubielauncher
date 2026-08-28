import { describe, expect, it } from "vitest";
import { IVersionSession } from "@/types/VersionStatistics";
import {
  currentStreakDays,
  hourHistogram,
  launchCleanRate,
  playtimeByAccount,
  playtimeByServer,
} from "./statistics";

function session(patch: Partial<IVersionSession>): IVersionSession {
  return {
    id: patch.id ?? Math.random().toString(16).slice(2),
    startedAt: patch.startedAt ?? "2026-08-01T10:00:00.000Z",
    endedAt: patch.endedAt ?? "2026-08-01T11:00:00.000Z",
    durationSec: patch.durationSec ?? 3600,
    exitCode: patch.exitCode ?? 0,
    crashed: patch.crashed ?? false,
    recovered: patch.recovered,
    account: patch.account,
    server: patch.server,
  };
}

describe("playtimeByServer", () => {
  it("groups singleplayer under one bucket and sorts by time", () => {
    const buckets = playtimeByServer(
      [
        session({ server: "mc.example.com", durationSec: 100 }),
        session({ server: "", durationSec: 500 }),
        session({ server: "mc.example.com", durationSec: 300 }),
        session({ durationSec: 50 }),
      ],
      "Одиночная",
    );

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ label: "Одиночная", seconds: 550, runs: 2 });
    expect(buckets[1]).toMatchObject({
      label: "mc.example.com",
      seconds: 400,
      runs: 2,
    });
  });

  it("ignores negative or broken durations", () => {
    const buckets = playtimeByServer(
      [session({ server: "a", durationSec: -5 }), session({ server: "a", durationSec: 10 })],
      "single",
    );

    expect(buckets[0].seconds).toBe(10);
    expect(buckets[0].runs).toBe(2);
  });
});

describe("playtimeByAccount", () => {
  it("skips sessions with no account", () => {
    const buckets = playtimeByAccount([
      session({ account: "Kituk", durationSec: 60 }),
      session({ durationSec: 999 }),
    ]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ label: "Kituk", seconds: 60 });
  });
});

describe("hourHistogram", () => {
  it("buckets by local start hour and skips unparsable dates", () => {
    const start = new Date(2026, 7, 1, 21, 30).toISOString();
    const hours = hourHistogram([
      session({ startedAt: start, durationSec: 120 }),
      session({ startedAt: "not-a-date", durationSec: 999 }),
    ]);

    expect(hours).toHaveLength(24);
    expect(hours[21]).toBe(120);
    expect(hours.reduce((sum, value) => sum + value, 0)).toBe(120);
  });
});

describe("currentStreakDays", () => {
  it("counts consecutive days ending today", () => {
    const now = new Date(2026, 7, 15, 12, 0);
    const day = (offset: number) =>
      new Date(2026, 7, 15 - offset, 20, 0).toISOString();

    expect(
      currentStreakDays(
        [
          session({ startedAt: day(0) }),
          session({ startedAt: day(1) }),
          session({ startedAt: day(2) }),
          session({ startedAt: day(5) }),
        ],
        now,
      ),
    ).toBe(3);
  });

  it("keeps the streak alive until the current day ends", () => {
    const now = new Date(2026, 7, 15, 9, 0);
    const day = (offset: number) =>
      new Date(2026, 7, 15 - offset, 20, 0).toISOString();

    expect(
      currentStreakDays(
        [
          session({ startedAt: day(1) }),
          session({ startedAt: day(2) }),
          session({ startedAt: day(3) }),
        ],
        now,
      ),
    ).toBe(3);
  });

  it("is zero once the streak is really broken", () => {
    const now = new Date(2026, 7, 15, 12, 0);
    const twoDaysAgo = new Date(2026, 7, 13, 20, 0).toISOString();

    expect(currentStreakDays([session({ startedAt: twoDaysAgo })], now)).toBe(0);
  });
});

describe("launchCleanRate", () => {
  it("counts crashes against every launch, not against stored sessions", () => {
    expect(launchCleanRate(9, 4)).toBe(56);
    expect(launchCleanRate(88, 0)).toBe(100);
  });

  it("has nothing to report without launches", () => {
    expect(launchCleanRate(0, 0)).toBeNull();
    expect(launchCleanRate(undefined, undefined)).toBeNull();
  });

  it("never drops below zero on broken counters", () => {
    expect(launchCleanRate(4, 40)).toBe(0);
    expect(launchCleanRate(4, -3)).toBe(100);
  });
});
