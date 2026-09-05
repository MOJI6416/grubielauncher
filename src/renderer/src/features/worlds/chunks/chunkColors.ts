import { IChunkSummary } from "@/types/WorldChunks";
import { WorldTotals } from "./chunkModel";

export type ChunkColorMode =
  | "satellite"
  | "status"
  | "inhabited"
  | "updated"
  | "dataVersion"
  | "size";

export const CHUNK_COLOR_MODES: ChunkColorMode[] = [
  "satellite",
  "status",
  "inhabited",
  "updated",
  "dataVersion",
  "size",
];

export type Rgb = readonly [number, number, number];

export interface ColorContext {
  minTimestamp: number | null;
  maxTimestamp: number | null;
  worldDataVersion: number | null;
  maxSectors: number;
}

export const TICKS_PER_MINUTE = 20 * 60;
/** Inhabited time at which the heat map saturates: two hours of presence. */
export const INHABITED_CAP_TICKS = 120 * TICKS_PER_MINUTE;

export const STATUS_ORDER = [
  "empty",
  "structure_starts",
  "structure_references",
  "biomes",
  "noise",
  "surface",
  "carvers",
  "liquid_carvers",
  "features",
  "initialize_light",
  "light",
  "spawn",
  "heightmaps",
  "full",
];

export const UNSCANNED_RGB: Rgb = [92, 90, 104];
export const PROBLEM_RGB: Rgb = [232, 72, 84];
export const UNSUPPORTED_RGB: Rgb = [166, 104, 232];
export const UNKNOWN_RGB: Rgb = [120, 118, 130];

const STATUS_EMPTY: Rgb = [126, 96, 56];
const STATUS_FULL: Rgb = [96, 196, 122];
const HEAT_COLD: Rgb = [58, 64, 92];
const HEAT_WARM: Rgb = [232, 160, 64];
const HEAT_HOT: Rgb = [236, 78, 62];
const AGE_OLD: Rgb = [54, 62, 96];
const AGE_NEW: Rgb = [96, 210, 220];
const VERSION_SAME: Rgb = [96, 196, 122];
const VERSION_OLDER: Rgb = [232, 150, 64];
const VERSION_MUCH_OLDER: Rgb = [220, 88, 70];
const VERSION_NEWER: Rgb = [96, 150, 236];
const SIZE_SMALL: Rgb = [70, 90, 120];
const SIZE_LARGE: Rgb = [232, 214, 96];

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

export function rgbCss(rgb: Rgb, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`
    : `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
}

/** 0 for an empty chunk, 1 for a fully generated one. */
export function statusRank(status: string | null): number {
  if (!status) return 0.5;
  const index = STATUS_ORDER.indexOf(status);
  if (index === -1) return status === "full" ? 1 : 0.5;
  return index / (STATUS_ORDER.length - 1);
}

/** 0 for never visited, 1 at the cap; logarithmic so short visits still show. */
export function inhabitedHeat(ticks: number | null): number {
  if (!ticks || ticks <= 0) return 0;
  return clamp01(Math.log1p(ticks) / Math.log1p(INHABITED_CAP_TICKS));
}

export function timestampAge(timestamp: number, context: ColorContext): number {
  if (
    context.minTimestamp === null ||
    context.maxTimestamp === null ||
    context.maxTimestamp <= context.minTimestamp
  ) {
    return 1;
  }
  return clamp01(
    (timestamp - context.minTimestamp) /
      (context.maxTimestamp - context.minTimestamp),
  );
}

export function colorContextFrom(totals: WorldTotals): ColorContext {
  return {
    minTimestamp: totals.minTimestamp,
    maxTimestamp: totals.maxTimestamp,
    worldDataVersion: totals.dominantDataVersion,
    maxSectors: totals.maxSectors,
  };
}

export function chunkRgb(
  chunk: IChunkSummary | null,
  mode: ChunkColorMode,
  context: ColorContext,
): Rgb {
  if (!chunk) return UNSCANNED_RGB;
  if (chunk.problem === "unsupported") return UNSUPPORTED_RGB;
  if (chunk.problem) return PROBLEM_RGB;

  switch (mode) {
    // The satellite view draws images; this only colours the placeholder.
    case "satellite":
    case "status":
      if (!chunk.status) return UNKNOWN_RGB;
      return mixRgb(STATUS_EMPTY, STATUS_FULL, statusRank(chunk.status));
    case "inhabited": {
      if (chunk.inhabitedTime === null) return UNKNOWN_RGB;
      const heat = inhabitedHeat(chunk.inhabitedTime);
      return heat < 0.5
        ? mixRgb(HEAT_COLD, HEAT_WARM, heat * 2)
        : mixRgb(HEAT_WARM, HEAT_HOT, (heat - 0.5) * 2);
    }
    case "updated":
      if (chunk.timestamp <= 0) return UNKNOWN_RGB;
      return mixRgb(AGE_OLD, AGE_NEW, timestampAge(chunk.timestamp, context));
    case "dataVersion": {
      if (chunk.dataVersion === null) return UNKNOWN_RGB;
      if (context.worldDataVersion === null) return VERSION_SAME;
      const delta = chunk.dataVersion - context.worldDataVersion;
      if (delta === 0) return VERSION_SAME;
      if (delta > 0) return VERSION_NEWER;
      return mixRgb(VERSION_OLDER, VERSION_MUCH_OLDER, clamp01(-delta / 1000));
    }
    case "size": {
      const max = Math.max(1, context.maxSectors);
      return mixRgb(SIZE_SMALL, SIZE_LARGE, Math.sqrt(chunk.sectors / max));
    }
  }
}

export interface LegendEntry {
  key: string;
  rgb: Rgb;
}

/** Keys resolve through `worldChunks.legend.*`. */
export function legendEntries(mode: ChunkColorMode): LegendEntry[] {
  const common: LegendEntry[] = [
    { key: "problem", rgb: PROBLEM_RGB },
    { key: "unsupported", rgb: UNSUPPORTED_RGB },
    { key: "unscanned", rgb: UNSCANNED_RGB },
  ];

  switch (mode) {
    case "satellite":
      return [
        { key: "surfacePending", rgb: UNKNOWN_RGB },
        { key: "problem", rgb: PROBLEM_RGB },
        { key: "unscanned", rgb: UNSCANNED_RGB },
      ];
    case "status":
      return [
        { key: "statusEmpty", rgb: STATUS_EMPTY },
        { key: "statusPartial", rgb: mixRgb(STATUS_EMPTY, STATUS_FULL, 0.5) },
        { key: "statusFull", rgb: STATUS_FULL },
        ...common,
      ];
    case "inhabited":
      return [
        { key: "inhabitedNone", rgb: HEAT_COLD },
        { key: "inhabitedSome", rgb: HEAT_WARM },
        { key: "inhabitedLong", rgb: HEAT_HOT },
        ...common,
      ];
    case "updated":
      return [
        { key: "updatedOld", rgb: AGE_OLD },
        { key: "updatedRecent", rgb: AGE_NEW },
        ...common,
      ];
    case "dataVersion":
      return [
        { key: "versionCurrent", rgb: VERSION_SAME },
        { key: "versionOlder", rgb: VERSION_OLDER },
        { key: "versionMuchOlder", rgb: VERSION_MUCH_OLDER },
        { key: "versionNewer", rgb: VERSION_NEWER },
        ...common,
      ];
    case "size":
      return [
        { key: "sizeSmall", rgb: SIZE_SMALL },
        { key: "sizeLarge", rgb: SIZE_LARGE },
        ...common,
      ];
  }
}
