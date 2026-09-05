import { describe, expect, it } from "vitest";
import {
  IChunkRegion,
  IChunkRegionScan,
  IChunkSummary,
} from "@/types/WorldChunks";
import {
  applyRegionScan,
  chunkAt,
  regionKey,
  removeRegion,
  stateFromRegions,
  summarizeWorld,
  worldBounds,
} from "./chunkModel";
import {
  emptySelection,
  invertSelection,
  isSelected,
  pruneSelection,
  selectAll,
  selectRadius,
  selectRect,
  selectWhere,
  selectionBounds,
  selectionCoords,
  selectionCount,
  selectionStats,
  setChunks,
} from "./chunkSelection";
import {
  DEFAULT_CAMERA,
  MAX_SCALE,
  chunkUnder,
  fitBounds,
  panBy,
  screenToWorld,
  visibleRegions,
  worldToScreen,
  zoomAt,
} from "./chunkCamera";
import {
  INHABITED_CAP_TICKS,
  PROBLEM_RGB,
  UNSCANNED_RGB,
  UNSUPPORTED_RGB,
  chunkRgb,
  inhabitedHeat,
  legendEntries,
  rgbCss,
  statusRank,
} from "./chunkColors";
import {
  ChunkFilter,
  DEFAULT_FILTER_VALUES,
  chunkMatches,
  normalizeFilterValues,
} from "./chunkFilters";

function summary(
  x: number,
  z: number,
  partial: Partial<IChunkSummary> = {},
): IChunkSummary {
  return {
    x,
    z,
    sectors: 2,
    timestamp: 1_700_000_000,
    compression: "zlib",
    external: false,
    status: "full",
    inhabitedTime: 0,
    lastUpdate: 1,
    dataVersion: 3465,
    problem: null,
    hasEntities: false,
    hasPoi: false,
    ...partial,
  };
}

function region(
  x: number,
  z: number,
  present: [number, number][],
): IChunkRegion {
  return {
    x,
    z,
    sizeBytes: 8192 + present.length * 4096,
    modifiedAt: 1,
    present: present.map(([lx, lz]) => (lz << 5) | lx),
  };
}

function scan(x: number, z: number, chunks: IChunkSummary[]): IChunkRegionScan {
  return { x, z, sizeBytes: 8192 + chunks.length * 4096, chunks };
}

const context = {
  minTimestamp: 1_000,
  maxTimestamp: 2_000,
  worldDataVersion: 3465,
  maxSectors: 8,
};

describe("chunk world state", () => {
  it("tracks presence from headers and details from scans", () => {
    const state = stateFromRegions([
      region(0, 0, [
        [0, 0],
        [1, 0],
      ]),
      region(-1, 0, [[31, 5]]),
    ]);

    expect(chunkAt(state, 1, 0)).toMatchObject({ present: true, chunk: null });
    expect(chunkAt(state, 2, 0)).toMatchObject({ present: false, chunk: null });
    expect(chunkAt(state, -1, 5)).toMatchObject({ present: true });
    expect(chunkAt(state, 40, 40)).toBeNull();

    const scanned = applyRegionScan(
      state,
      scan(0, 0, [
        summary(0, 0),
        summary(1, 0, { problem: "nbt" }),
        summary(3, 3, { problem: "unsupported" }),
      ]),
    );

    expect(state.get(regionKey(0, 0))?.scanned).toBe(false);
    expect(scanned.get(regionKey(0, 0))).toMatchObject({
      scanned: true,
      presentCount: 3,
      problems: 1,
    });
    expect(chunkAt(scanned, 1, 0)?.chunk?.problem).toBe("nbt");
    expect(chunkAt(scanned, 3, 3)?.present).toBe(true);

    expect(removeRegion(scanned, regionKey(0, 0)).has(regionKey(0, 0))).toBe(
      false,
    );
    expect(removeRegion(scanned, "9,9")).toBe(scanned);
  });

  it("computes bounds and totals", () => {
    const state = applyRegionScan(
      stateFromRegions([
        region(0, 0, [
          [0, 0],
          [5, 7],
        ]),
        region(-2, -1, [[31, 31]]),
      ]),
      scan(0, 0, [
        summary(0, 0, { timestamp: 500, inhabitedTime: 100, sectors: 3 }),
        summary(5, 7, {
          timestamp: 900,
          status: "light",
          dataVersion: 3000,
          sectors: 9,
        }),
      ]),
    );

    expect(worldBounds(state)).toEqual({
      minX: -33,
      minZ: -1,
      maxX: 5,
      maxZ: 7,
    });

    const totals = summarizeWorld(state);
    expect(totals).toMatchObject({
      regions: 2,
      scannedRegions: 1,
      chunks: 3,
      minTimestamp: 500,
      maxTimestamp: 900,
      maxInhabited: 100,
      maxSectors: 9,
      statusCounts: { full: 1, light: 1 },
      dominantDataVersion: 3465,
    });
    expect(totals.dataVersions).toEqual([
      { version: 3465, count: 1 },
      { version: 3000, count: 1 },
    ]);
    expect(worldBounds(new Map())).toBeNull();
  });
});

describe("chunk selection", () => {
  const state = applyRegionScan(
    stateFromRegions([
      region(0, 0, [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [10, 10],
      ]),
      region(-1, 0, [[31, 0]]),
    ]),
    scan(0, 0, [
      summary(0, 0, { inhabitedTime: 0 }),
      summary(1, 0, { inhabitedTime: 50_000, sectors: 4 }),
      summary(2, 0, { problem: "compression" }),
      summary(0, 1, { status: "noise" }),
      summary(10, 10),
    ]),
  );

  it("adds, toggles, subtracts and replaces without touching the old value", () => {
    const one = setChunks(
      emptySelection(),
      [
        [0, 0],
        [-1, 0],
      ],
      "add",
    );
    expect(selectionCount(one)).toBe(2);
    expect(isSelected(one, -1, 0)).toBe(true);

    const toggled = setChunks(
      one,
      [
        [0, 0],
        [1, 0],
      ],
      "toggle",
    );
    expect(isSelected(toggled, 0, 0)).toBe(false);
    expect(isSelected(toggled, 1, 0)).toBe(true);
    expect(isSelected(one, 0, 0)).toBe(true);

    const less = setChunks(toggled, [[-1, 0]], "subtract");
    expect(less.has(regionKey(-1, 0))).toBe(false);
    expect(selectionCount(less)).toBe(1);

    const replaced = setChunks(less, [[2, 0]], "replace");
    expect(selectionCoords(replaced)).toEqual([2, 0]);
  });

  it("selects present chunks in a rectangle given in any corner order", () => {
    const selection = selectRect(
      emptySelection(),
      state,
      { minX: 2, minZ: 1, maxX: -1, maxZ: 0 },
      "replace",
    );
    expect(selectionCoords(selection)).toEqual([0, 0, 1, 0, 2, 0, 0, 1, -1, 0]);
    expect(selectionBounds(selection)).toEqual({
      minX: -1,
      minZ: 0,
      maxX: 2,
      maxZ: 1,
    });
  });

  it("selects within a radius and by predicate", () => {
    const circle = selectRadius(
      emptySelection(),
      state,
      { x: 1.25, z: 0.5 },
      1.4,
      "replace",
    );
    expect(selectionCoords(circle)).toEqual([0, 0, 1, 0, 2, 0, 0, 1]);

    const visited = selectWhere(
      emptySelection(),
      state,
      (chunk) => (chunk.inhabitedTime ?? 0) > 0,
      "replace",
    );
    expect(selectionCoords(visited)).toEqual([1, 0]);

    const merged = selectWhere(circle, state, (chunk) => chunk.x === 10, "add");
    expect(selectionCount(merged)).toBe(5);
  });

  it("selects everything, inverts and prunes", () => {
    const all = selectAll(state);
    expect(selectionCount(all)).toBe(6);

    const some = setChunks(
      emptySelection(),
      [
        [0, 0],
        [10, 10],
      ],
      "add",
    );
    const inverted = invertSelection(some, state);
    expect(selectionCount(inverted)).toBe(4);
    expect(isSelected(inverted, 0, 0)).toBe(false);
    expect(isSelected(inverted, -1, 0)).toBe(true);

    const stale = setChunks(
      all,
      [
        [20, 20],
        [0, 0],
      ],
      "add",
    );
    const pruned = pruneSelection(stale, state);
    expect(selectionCount(pruned)).toBe(6);
    expect(isSelected(pruned, 20, 20)).toBe(false);
    expect(
      pruneSelection(setChunks(emptySelection(), [[99, 99]], "add"), state)
        .size,
    ).toBe(0);
  });

  it("summarises what is selected", () => {
    const selection = setChunks(
      emptySelection(),
      [
        [1, 0],
        [2, 0],
        [-1, 0],
      ],
      "add",
    );
    expect(selectionStats(selection, state)).toEqual({
      count: 3,
      regions: 2,
      sizeBytes: 4 * 4096 + 2 * 4096,
      problems: 1,
      unscanned: 1,
      inhabitedTicks: 50_000,
    });
  });
});

describe("camera", () => {
  it("round-trips screen and world coordinates", () => {
    const camera = { x: 10, z: -5, scale: 8 };
    const [sx, sy] = worldToScreen(camera, 800, 600, 12, -3);
    expect([sx, sy]).toEqual([416, 316]);
    expect(screenToWorld(camera, 800, 600, sx, sy)).toEqual([12, -3]);
    expect(chunkUnder(camera, 800, 600, 415, 315)).toEqual({ x: 11, z: -4 });
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const camera = { x: 0, z: 0, scale: 4 };
    const before = screenToWorld(camera, 800, 600, 100, 50);
    const zoomed = zoomAt(camera, 800, 600, 100, 50, 2);
    expect(zoomed.scale).toBe(8);
    const after = screenToWorld(zoomed, 800, 600, 100, 50);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);

    expect(zoomAt({ ...camera, scale: MAX_SCALE }, 800, 600, 0, 0, 2)).toEqual({
      ...camera,
      scale: MAX_SCALE,
    });
    expect(panBy(camera, 40, -20)).toEqual({ x: -10, z: 5, scale: 4 });
  });

  it("fits bounds into the viewport and lists visible regions", () => {
    const camera = fitBounds(
      { minX: -32, minZ: -32, maxX: 31, maxZ: 31 },
      640 + 64,
      640 + 64,
    );
    expect(camera).toEqual({ x: 0, z: 0, scale: 10 });

    const regions = visibleRegions(camera, 704, 704);
    expect(regions).toEqual({ minX: -2, minZ: -2, maxX: 1, maxZ: 1 });
    expect(DEFAULT_CAMERA.scale).toBeGreaterThan(0);
  });
});

describe("colours", () => {
  it("ranks statuses and heats inhabited time", () => {
    expect(statusRank("empty")).toBe(0);
    expect(statusRank("full")).toBe(1);
    expect(statusRank("noise")).toBeGreaterThan(statusRank("biomes"));
    expect(statusRank("weird")).toBe(0.5);

    expect(inhabitedHeat(0)).toBe(0);
    expect(inhabitedHeat(INHABITED_CAP_TICKS)).toBe(1);
    expect(inhabitedHeat(1200)).toBeGreaterThan(0.3);
  });

  it("prioritises problems over the colour mode", () => {
    expect(chunkRgb(null, "status", context)).toBe(UNSCANNED_RGB);
    expect(
      chunkRgb(summary(0, 0, { problem: "header" }), "size", context),
    ).toBe(PROBLEM_RGB);
    expect(
      chunkRgb(summary(0, 0, { problem: "unsupported" }), "inhabited", context),
    ).toBe(UNSUPPORTED_RGB);

    const full = chunkRgb(summary(0, 0), "status", context);
    const empty = chunkRgb(
      summary(0, 0, { status: "empty" }),
      "status",
      context,
    );
    expect(full[1]).toBeGreaterThan(empty[1]);

    const same = chunkRgb(summary(0, 0), "dataVersion", context);
    const older = chunkRgb(
      summary(0, 0, { dataVersion: 2500 }),
      "dataVersion",
      context,
    );
    const newer = chunkRgb(
      summary(0, 0, { dataVersion: 4000 }),
      "dataVersion",
      context,
    );
    expect(same).not.toEqual(older);
    expect(newer[2]).toBeGreaterThan(older[2]);

    expect(rgbCss([1, 2, 3])).toBe("rgb(1 2 3)");
    expect(rgbCss([1, 2, 3], 0.5)).toBe("rgb(1 2 3 / 0.5)");
  });

  it("lists a legend for every mode", () => {
    for (const mode of [
      "status",
      "inhabited",
      "updated",
      "dataVersion",
      "size",
    ] as const) {
      const entries = legendEntries(mode);
      expect(entries.length).toBeGreaterThan(3);
      expect(entries.at(-1)?.key).toBe("unscanned");
    }
  });
});

describe("filters", () => {
  const base: ChunkFilter = {
    ...DEFAULT_FILTER_VALUES,
    kind: "unvisited",
    now: 2_000_000,
  };

  it("matches each kind", () => {
    expect(
      chunkMatches(summary(0, 0, { inhabitedTime: 600 }), {
        ...base,
        maxMinutes: 1,
      }),
    ).toBe(true);
    expect(
      chunkMatches(summary(0, 0, { inhabitedTime: 6000 }), {
        ...base,
        maxMinutes: 1,
      }),
    ).toBe(false);
    expect(chunkMatches(summary(0, 0, { inhabitedTime: null }), base)).toBe(
      false,
    );

    expect(
      chunkMatches(summary(0, 0, { status: "light" }), {
        ...base,
        kind: "incomplete",
      }),
    ).toBe(true);
    expect(chunkMatches(summary(0, 0), { ...base, kind: "incomplete" })).toBe(
      false,
    );

    expect(
      chunkMatches(summary(0, 0, { problem: "nbt" }), {
        ...base,
        kind: "problems",
      }),
    ).toBe(true);
    expect(
      chunkMatches(summary(0, 0, { problem: "unsupported" }), {
        ...base,
        kind: "problems",
      }),
    ).toBe(false);

    expect(
      chunkMatches(summary(0, 0, { timestamp: 1_000_000 }), {
        ...base,
        kind: "olderThan",
        days: 10,
      }),
    ).toBe(true);
    expect(
      chunkMatches(summary(0, 0, { timestamp: 1_999_000 }), {
        ...base,
        kind: "olderThan",
        days: 10,
      }),
    ).toBe(false);

    expect(
      chunkMatches(summary(0, 0, { dataVersion: 2000 }), {
        ...base,
        kind: "dataVersionBelow",
        dataVersion: 3000,
      }),
    ).toBe(true);
    expect(
      chunkMatches(summary(0, 0), {
        ...base,
        kind: "dataVersionBelow",
        dataVersion: 3000,
      }),
    ).toBe(false);

    const far = {
      ...base,
      kind: "fartherThan" as const,
      centerX: 0,
      centerZ: 0,
      distance: 3,
    };
    expect(chunkMatches(summary(5, 0), far)).toBe(true);
    expect(chunkMatches(summary(1, 1), far)).toBe(false);
  });

  it("normalises form values", () => {
    expect(
      normalizeFilterValues({
        ...DEFAULT_FILTER_VALUES,
        maxMinutes: -3,
        days: Number.NaN,
        dataVersion: 12.7,
        distance: 5,
        centerX: Number.NaN,
        centerZ: 2,
      }),
    ).toEqual({
      maxMinutes: 0,
      days: DEFAULT_FILTER_VALUES.days,
      dataVersion: 13,
      distance: 5,
      centerX: 0,
      centerZ: 2,
    });
  });
});
