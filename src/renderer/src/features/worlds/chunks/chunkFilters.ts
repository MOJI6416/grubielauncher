import { IChunkSummary } from "@/types/WorldChunks";
import { isRealProblem } from "./chunkModel";
import { TICKS_PER_MINUTE } from "./chunkColors";

export type ChunkFilterKind =
  | "unvisited"
  | "incomplete"
  | "problems"
  | "olderThan"
  | "dataVersionBelow"
  | "fartherThan";

export const CHUNK_FILTER_KINDS: ChunkFilterKind[] = [
  "unvisited",
  "incomplete",
  "problems",
  "olderThan",
  "dataVersionBelow",
  "fartherThan",
];

export interface ChunkFilterValues {
  /** `unvisited`: inhabited for at most this many minutes. */
  maxMinutes: number;
  /** `olderThan`: last saved more than this many days ago. */
  days: number;
  /** `dataVersionBelow`: saved with a data version below this one. */
  dataVersion: number;
  /** `fartherThan`: further than this many chunks from the point. */
  distance: number;
  centerX: number;
  centerZ: number;
}

export const DEFAULT_FILTER_VALUES: ChunkFilterValues = {
  maxMinutes: 1,
  days: 90,
  dataVersion: 0,
  distance: 64,
  centerX: 0,
  centerZ: 0,
};

export interface ChunkFilter extends ChunkFilterValues {
  kind: ChunkFilterKind;
  /** Seconds since the epoch, for `olderThan`. */
  now: number;
}

export function inhabitedMinutes(ticks: number | null): number {
  if (!ticks || ticks <= 0) return 0;
  return ticks / TICKS_PER_MINUTE;
}

export function chunkMatches(
  chunk: IChunkSummary,
  filter: ChunkFilter,
): boolean {
  switch (filter.kind) {
    case "unvisited":
      return (
        chunk.inhabitedTime !== null &&
        chunk.inhabitedTime <= filter.maxMinutes * TICKS_PER_MINUTE
      );
    case "incomplete":
      return chunk.status !== null && chunk.status !== "full";
    case "problems":
      return isRealProblem(chunk);
    case "olderThan":
      return (
        chunk.timestamp > 0 &&
        chunk.timestamp < filter.now - filter.days * 86_400
      );
    case "dataVersionBelow":
      return (
        chunk.dataVersion !== null && chunk.dataVersion < filter.dataVersion
      );
    case "fartherThan": {
      const dx = chunk.x + 0.5 - filter.centerX;
      const dz = chunk.z + 0.5 - filter.centerZ;
      return dx * dx + dz * dz > filter.distance * filter.distance;
    }
  }
}

export function filterNeedsValue(
  kind: ChunkFilterKind,
): keyof ChunkFilterValues | null {
  switch (kind) {
    case "unvisited":
      return "maxMinutes";
    case "olderThan":
      return "days";
    case "dataVersionBelow":
      return "dataVersion";
    case "fartherThan":
      return "distance";
    default:
      return null;
  }
}

/** Keeps the numeric inputs of the filter form sane. */
export function normalizeFilterValues(
  values: ChunkFilterValues,
): ChunkFilterValues {
  const finite = (value: number, fallback: number, min: number) =>
    Number.isFinite(value) ? Math.max(min, value) : fallback;

  return {
    maxMinutes: finite(values.maxMinutes, DEFAULT_FILTER_VALUES.maxMinutes, 0),
    days: finite(values.days, DEFAULT_FILTER_VALUES.days, 0),
    dataVersion: Math.round(finite(values.dataVersion, 0, 0)),
    distance: finite(values.distance, DEFAULT_FILTER_VALUES.distance, 0),
    centerX: Number.isFinite(values.centerX) ? values.centerX : 0,
    centerZ: Number.isFinite(values.centerZ) ? values.centerZ : 0,
  };
}
