import { describe, expect, it } from "vitest";
import { EMPTY_ACHIEVEMENT_STATS } from "@/types/Achievements";
import {
  accountAgeDays,
  buildWorldMetrics,
  favouriteInstance,
  hasWorldData,
  playedHours,
  reachPercentParts,
} from "./profileMetrics";

describe("buildWorldMetrics", () => {
  it("converts raw world counters into readable units", () => {
    const metrics = buildWorldMetrics({
      ...EMPTY_ACHIEVEMENT_STATS,
      playTimeTicks: 144_000,
      distanceCm: 2_500_000,
      blocksMined: 12_345,
    });

    const byKey = new Map(metrics.map((metric) => [metric.key, metric.value]));

    expect(byKey.get("playTimeTicks")).toBe(2);
    expect(byKey.get("distanceCm")).toBe(25);
    expect(byKey.get("blocksMined")).toBe(12345);
    expect(byKey.get("deaths")).toBe(0);
  });

  it("always returns the same metric set in the same order", () => {
    const first = buildWorldMetrics(EMPTY_ACHIEVEMENT_STATS);
    const second = buildWorldMetrics({
      ...EMPTY_ACHIEVEMENT_STATS,
      deaths: 5,
    });

    expect(first.map((metric) => metric.key)).toEqual(
      second.map((metric) => metric.key),
    );
    expect(first).toHaveLength(8);
  });

  it("never returns negative or fractional counts", () => {
    const metrics = buildWorldMetrics({
      ...EMPTY_ACHIEVEMENT_STATS,
      deaths: -4,
      blocksMined: 10.9,
    });
    const byKey = new Map(metrics.map((metric) => [metric.key, metric.value]));

    expect(byKey.get("deaths")).toBe(0);
    expect(byKey.get("blocksMined")).toBe(10);
  });
});

describe("hasWorldData", () => {
  it("detects an untouched stats block", () => {
    expect(hasWorldData(EMPTY_ACHIEVEMENT_STATS)).toBe(false);
    expect(hasWorldData({ ...EMPTY_ACHIEVEMENT_STATS, jumps: 1 })).toBe(true);
  });
});

describe("favouriteInstance", () => {
  const instance = (key: string, playTime: number, launches = 1) => ({
    key,
    name: key,
    loader: "fabric",
    playTime,
    launches,
  });

  it("picks the most played instance", () => {
    expect(
      favouriteInstance([
        instance("a", 100),
        instance("b", 900),
        instance("c", 400),
      ])?.key,
    ).toBe("b");
  });

  it("breaks a tie by launches", () => {
    expect(
      favouriteInstance([instance("a", 100, 2), instance("b", 100, 9)])?.key,
    ).toBe("b");
  });

  it("ignores never played instances", () => {
    expect(favouriteInstance([instance("a", 0, 3)])).toBeNull();
    expect(favouriteInstance([])).toBeNull();
  });
});

describe("reachPercentParts", () => {
  it("keeps one decimal under ten percent and rounds above it", () => {
    expect(reachPercentParts(0.84)).toEqual({ belowFloor: false, value: 0.8 });
    expect(reachPercentParts(12.4)).toEqual({ belowFloor: false, value: 12 });
  });

  it("marks anything under a tenth of a percent instead of showing zero", () => {
    expect(reachPercentParts(0.04)).toEqual({ belowFloor: true, value: 0.1 });
  });

  it("reports a true zero and ignores broken input", () => {
    expect(reachPercentParts(0)).toEqual({ belowFloor: false, value: 0 });
    expect(reachPercentParts(Number.NaN)).toEqual({
      belowFloor: false,
      value: 0,
    });
  });
});

describe("playedHours", () => {
  it("floors seconds into hours", () => {
    expect(playedHours(7_199)).toBe(1);
    expect(playedHours(0)).toBe(0);
    expect(playedHours(-10)).toBe(0);
  });
});

describe("accountAgeDays", () => {
  it("counts whole days since registration", () => {
    const now = Date.UTC(2026, 0, 31);
    expect(accountAgeDays(new Date(Date.UTC(2026, 0, 1)), now)).toBe(30);
  });

  it("never goes negative and survives a broken date", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(accountAgeDays(new Date(Date.UTC(2027, 0, 1)), now)).toBe(0);
    expect(accountAgeDays(new Date("nonsense"), now)).toBe(0);
  });
});
