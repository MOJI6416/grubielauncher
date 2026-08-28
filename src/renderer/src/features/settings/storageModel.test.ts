import { describe, expect, it } from "vitest";
import type { StorageBreakdown } from "@/types/Storage";
import {
  cleanupOffers,
  storageSlices,
  topVersions,
  totalReclaimable,
} from "./storageModel";

const breakdown = (patch: Partial<StorageBreakdown> = {}): StorageBreakdown => ({
  total: 1000,
  rootPath: "C:/launcher",
  categories: [
    { id: "versions", size: 500 },
    { id: "libraries", size: 300 },
    { id: "assets", size: 200 },
    { id: "java", size: 0 },
    { id: "backups", size: 0 },
    { id: "appData", size: 0 },
    { id: "other", size: 0 },
  ],
  versions: [
    { name: "big", size: 400 },
    { name: "small", size: 100 },
  ],
  reclaimable: 0,
  cleanup: {
    java: { count: 0, size: 0 },
    libraries: { count: 0, size: 0, safe: false },
    backups: { count: 0, size: 0 },
    instances: { count: 0, size: 0, names: [], dataNames: [] },
  },
  computedAt: 0,
  ...patch,
});

describe("storageSlices", () => {
  it("drops empty categories and sorts by size", () => {
    expect(storageSlices(breakdown())).toEqual([
      { id: "versions", size: 500, percent: 50 },
      { id: "libraries", size: 300, percent: 30 },
      { id: "assets", size: 200, percent: 20 },
    ]);
  });

  it("returns nothing for an empty or missing breakdown", () => {
    expect(storageSlices(null)).toEqual([]);
    expect(storageSlices(breakdown({ total: 0 }))).toEqual([]);
  });
});

describe("cleanupOffers", () => {
  it("offers nothing when there is nothing to reclaim", () => {
    expect(cleanupOffers(breakdown())).toEqual([]);
  });

  it("offers the cache first", () => {
    const offers = cleanupOffers(breakdown({ reclaimable: 120 }));

    expect(offers).toEqual([
      { action: "cache", size: 120, count: 0, destructive: false },
    ]);
  });

  it("hides orphaned libraries when the scan is not trustworthy", () => {
    const unsafe = breakdown({
      cleanup: {
        ...breakdown().cleanup,
        libraries: { count: 9, size: 900, safe: false },
      },
    });

    expect(cleanupOffers(unsafe)).toEqual([]);
  });

  it("marks instance cleanup destructive only when player data is inside", () => {
    const withData = breakdown({
      cleanup: {
        ...breakdown().cleanup,
        instances: {
          count: 2,
          size: 50,
          names: ["a", "b"],
          dataNames: ["b"],
        },
      },
    });
    const withoutData = breakdown({
      cleanup: {
        ...breakdown().cleanup,
        instances: { count: 1, size: 10, names: ["a"], dataNames: [] },
      },
    });

    expect(cleanupOffers(withData)[0].destructive).toBe(true);
    expect(cleanupOffers(withoutData)[0].destructive).toBe(false);
  });

  it("sums every offer", () => {
    const full = breakdown({
      reclaimable: 100,
      cleanup: {
        java: { count: 1, size: 200 },
        libraries: { count: 4, size: 300, safe: true },
        backups: { count: 2, size: 400 },
        instances: { count: 1, size: 500, names: ["x"], dataNames: [] },
      },
    });

    expect(cleanupOffers(full).map((offer) => offer.action)).toEqual([
      "cache",
      "java",
      "libraries",
      "backups",
      "instances",
    ]);
    expect(totalReclaimable(full)).toBe(1500);
  });
});

describe("topVersions", () => {
  it("scales bars against the biggest instance", () => {
    expect(topVersions(breakdown(), 5)).toEqual({
      entries: [
        { name: "big", size: 400, percent: 100 },
        { name: "small", size: 100, percent: 25 },
      ],
      rest: 0,
    });
  });

  it("reports how many were cut off", () => {
    expect(topVersions(breakdown(), 1).rest).toBe(1);
  });

  it("survives an empty breakdown", () => {
    expect(topVersions(null, 5)).toEqual({ entries: [], rest: 0 });
  });
});
