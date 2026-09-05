import { WorldBackupErrorCode } from "./WorldBackup";

export const CHUNKS_PER_REGION_AXIS = 32;
export const CHUNKS_PER_REGION =
  CHUNKS_PER_REGION_AXIS * CHUNKS_PER_REGION_AXIS;
export const BLOCKS_PER_CHUNK = 16;
export const REGION_SECTOR_BYTES = 4096;

/** The most chunks a single edit request may touch. */
export const MAX_CHUNK_EDIT_COUNT = 500_000;

export const OVERWORLD_ID = "minecraft:overworld";
export const NETHER_ID = "minecraft:the_nether";
export const END_ID = "minecraft:the_end";

export type ChunkCompression =
  | "gzip"
  | "zlib"
  | "none"
  | "lz4"
  | "custom"
  | "unknown";

/**
 * Why a chunk could not be read in full.
 *
 * - `header` — the region header points outside the file or at garbage.
 * - `compression` — the payload does not decompress.
 * - `nbt` — the decompressed payload is not a well-formed NBT compound.
 * - `position` — the chunk says it belongs to different coordinates.
 * - `unsupported` — the payload uses a compression the launcher cannot decode (LZ4 or custom).
 */
export type ChunkProblem =
  | "header"
  | "compression"
  | "nbt"
  | "position"
  | "unsupported";

export interface IChunkDimension {
  /** Resource id, e.g. `minecraft:overworld` or `mymod:mining_world`. */
  id: string;
  /** Folder relative to the world root: `` for the overworld, `DIM-1`, `dimensions/ns/name`. */
  folder: string;
  regionCount: number;
  chunkCount: number;
  sizeBytes: number;
  hasEntities: boolean;
  hasPoi: boolean;
}

export interface IChunkRegion {
  x: number;
  z: number;
  sizeBytes: number;
  modifiedAt: number;
  /** Local chunk indices (0…1023) that have data in the region file. */
  present: number[];
}

export interface IChunkSummary {
  /** Absolute chunk coordinates. */
  x: number;
  z: number;
  sectors: number;
  /** Seconds since the epoch, as written by the game. */
  timestamp: number;
  compression: ChunkCompression;
  external: boolean;
  status: string | null;
  inhabitedTime: number | null;
  lastUpdate: number | null;
  dataVersion: number | null;
  problem: ChunkProblem | null;
  hasEntities: boolean;
  hasPoi: boolean;
}

export interface IChunkRegionScan {
  x: number;
  z: number;
  sizeBytes: number;
  chunks: IChunkSummary[];
}

export interface IChunkBlockEntity {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface IChunkEntityGroup {
  id: string;
  count: number;
}

export type ChunkNbtFormat = "flat" | "level" | "unknown";

export interface IChunkDetails extends IChunkSummary {
  format: ChunkNbtFormat;
  compressedBytes: number;
  nbtBytes: number | null;
  yMin: number | null;
  yMax: number | null;
  sectionCount: number | null;
  lightOn: boolean | null;
  heightmaps: string[];
  biomes: string[];
  structureStarts: string[];
  structureReferences: string[];
  blockEntities: IChunkBlockEntity[];
  entities: IChunkEntityGroup[];
  poiCount: number | null;
}

export type ChunkEditErrorCode =
  | "worldMissing"
  | "versionRunning"
  | "dimensionMissing"
  | "nothingSelected"
  | "tooManyChunks"
  | "backupFailed"
  | "failed";

export interface IChunkEditOptions {
  backup: boolean;
  keep: number;
}

export interface IChunkEditSummary {
  /** Chunks that were removed or rewritten. */
  affected: number;
  /** Chunks that were selected but left untouched (unreadable compression, already gone). */
  skipped: number;
  /** Region files that were rewritten or deleted. */
  regions: number;
  /** Region files that became empty and were deleted. */
  removedFiles: number;
  bytesBefore: number;
  bytesAfter: number;
  backupId: string | null;
}

export type ChunkEditResult =
  | ({ ok: true } & IChunkEditSummary)
  | {
      ok: false;
      error: ChunkEditErrorCode;
      backupError?: WorldBackupErrorCode;
    };

export function chunkLocalIndex(x: number, z: number): number {
  return ((z & 31) << 5) | (x & 31);
}

export function regionCoordinate(chunk: number): number {
  return chunk >> 5;
}

export function chunkCoordinate(block: number): number {
  return Math.floor(block) >> 4;
}

export function isDimensionId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 256) return false;
  const match = /^([a-z0-9_.-]+):([a-z0-9_./-]+)$/.exec(value);
  if (!match) return false;

  return match[2]
    .split("/")
    .every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    );
}
