import { describe, expect, it } from "vitest";
import type { ISessionConfig, ISessionResources, IVersionSession } from "@/types/VersionStatistics";
import { measuredSessions, usageAdvice } from "./resourceStats";

const base: ISessionConfig = {
  minecraft: "1.21.1",
  loader: "fabric",
  loaderVersion: "0.16.9",
  xmxMb: 6144,
  optimizedJvm: true,
  javaMajor: 21,
  mods: 120,
};

let counter = 0;
function session(config?: Partial<ISessionConfig>, resources?: ISessionResources, durationSec = 1800): IVersionSession {
  counter += 1;
  return {
    id: `s${counter}`,
    startedAt: `2026-11-0${counter}T10:00:00.000Z`,
    endedAt: `2026-11-0${counter}T11:00:00.000Z`,
    durationSec,
    exitCode: 0,
    crashed: false,
    config: config ? { ...base, ...config } : undefined,
    resources,
  };
}

describe("measuredSessions", () => {
  it("skips sessions recorded before measurements existed", () => {
    const list = measuredSessions([session(), session(undefined, undefined), session({}, { heapPeakMb: 2000 })]);
    expect(list).toHaveLength(1);
    expect(list[0].changes).toEqual([]);
  });

  it("collects mod changes made across unmeasured launches", () => {
    const list = measuredSessions([
      session({}, { heapPeakMb: 2000 }),
      session({ modsAdded: ["Iris"], modsAddedCount: 1 }),
      session({ modsAdded: ["Distant Horizons", "Iris"], modsAddedCount: 2, modsRemoved: ["Sodium"], modsRemovedCount: 1, xmxMb: 8192 }, { heapPeakMb: 3500 }),
    ]);
    expect(list).toHaveLength(2);
    expect(list[1].changes).toEqual([
      { kind: "modsAdded", count: 3, titles: ["Iris", "Distant Horizons"] },
      { kind: "modsRemoved", count: 1, titles: ["Sodium"] },
      { kind: "memory", from: 6144, to: 8192 },
    ]);
  });

  it("reports a Minecraft update instead of a loader bump that came with it", () => {
    const list = measuredSessions([
      session({}, { loadSec: 40 }),
      session({ minecraft: "1.21.4", loaderVersion: "0.17.0" }, { loadSec: 45 }),
    ]);
    expect(list[1].changes).toEqual([{ kind: "minecraft", from: "1.21.1", to: "1.21.4" }]);
  });
});

describe("usageAdvice", () => {
  it("says memory is tight when the heap fills the allocation", () => {
    const list = measuredSessions([
      session({ xmxMb: 4096 }, { heapPeakMb: 3900, heapCapacityMb: 4096 }),
    ]);
    expect(usageAdvice(list)).toEqual({ kind: "tight", peakMb: 3900, xmxMb: 4096, suggestMb: 5632, sessions: 1 });
  });

  it("never suggests more than the computer can give", () => {
    const list = measuredSessions([session({ xmxMb: 6144 }, { heapPeakMb: 6000, heapCapacityMb: 6144 })]);
    expect(usageAdvice(list, 8192)).toEqual({ kind: "tightMax", peakMb: 6000, xmxMb: 6144, sessions: 1 });
    expect(usageAdvice(list, 16384)).toEqual({ kind: "tight", peakMb: 6000, xmxMb: 6144, suggestMb: 8704, sessions: 1 });
  });

  it("suggests giving back memory the game never uses", () => {
    const list = measuredSessions([
      session({ xmxMb: 12288 }, { heapPeakMb: 2300 }),
      session({ xmxMb: 12288 }, { heapPeakMb: 2600 }),
    ]);
    expect(usageAdvice(list)).toEqual({ kind: "excess", peakMb: 2600, xmxMb: 12288, suggestMb: 4608, sessions: 2 });
  });

  it("does not judge the allocation by one short session", () => {
    const list = measuredSessions([session({ xmxMb: 12288 }, { heapPeakMb: 2300 }, 60)]);
    expect(usageAdvice(list)?.kind).toBe("ok");
  });

  it("points at the optimized flags when long pauses keep happening", () => {
    const list = measuredSessions([
      session({ optimizedJvm: false }, { heapPeakMb: 3000, pauses: { count: 400, long: 6, longestMs: 420, totalMs: 9000 } }),
      session({ optimizedJvm: false }, { heapPeakMb: 3100, pauses: { count: 380, long: 4, longestMs: 300, totalMs: 8000 } }),
    ]);
    expect(usageAdvice(list)).toEqual({ kind: "pauses", long: 6, sessions: 2 });
  });

  it("has no advice without a heap measurement", () => {
    expect(usageAdvice(measuredSessions([session({}, { loadSec: 30 })]))).toBeNull();
  });
});
