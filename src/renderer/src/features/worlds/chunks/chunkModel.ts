import {
  CHUNKS_PER_REGION,
  CHUNKS_PER_REGION_AXIS,
  IChunkRegion,
  IChunkRegionScan,
  IChunkSummary,
} from "@/types/WorldChunks";

export function regionKey(x: number, z: number): string {
  return `${x},${z}`;
}

export function parseRegionKey(key: string): { x: number; z: number } {
  const [x, z] = key.split(",").map(Number);
  return { x, z };
}

export function chunkIndex(x: number, z: number): number {
  return ((z & 31) << 5) | (x & 31);
}

export function regionOf(chunk: number): number {
  return chunk >> 5;
}

export interface RegionState {
  key: string;
  x: number;
  z: number;
  sizeBytes: number;
  /** One flag per local chunk index, from the region header. */
  present: Uint8Array;
  presentCount: number;
  /** Per local index, once the region has been scanned. */
  chunks: (IChunkSummary | null)[] | null;
  scanned: boolean;
  problems: number;
}

export type ChunkWorldState = Map<string, RegionState>;

export function regionFromHeader(region: IChunkRegion): RegionState {
  const present = new Uint8Array(CHUNKS_PER_REGION);
  let presentCount = 0;

  for (const index of region.present) {
    if (index < 0 || index >= CHUNKS_PER_REGION || present[index]) continue;
    present[index] = 1;
    presentCount += 1;
  }

  return {
    key: regionKey(region.x, region.z),
    x: region.x,
    z: region.z,
    sizeBytes: region.sizeBytes,
    present,
    presentCount,
    chunks: null,
    scanned: false,
    problems: 0,
  };
}

export function isRealProblem(
  chunk: IChunkSummary | null | undefined,
): boolean {
  return Boolean(chunk?.problem && chunk.problem !== "unsupported");
}

export function regionFromScan(scan: IChunkRegionScan): RegionState {
  const present = new Uint8Array(CHUNKS_PER_REGION);
  const chunks: (IChunkSummary | null)[] = new Array(CHUNKS_PER_REGION).fill(
    null,
  );
  let presentCount = 0;
  let problems = 0;

  for (const chunk of scan.chunks) {
    const index = chunkIndex(chunk.x, chunk.z);
    if (present[index]) continue;

    present[index] = 1;
    chunks[index] = chunk;
    presentCount += 1;
    if (isRealProblem(chunk)) problems += 1;
  }

  return {
    key: regionKey(scan.x, scan.z),
    x: scan.x,
    z: scan.z,
    sizeBytes: scan.sizeBytes,
    present,
    presentCount,
    chunks,
    scanned: true,
    problems,
  };
}

export function stateFromRegions(regions: IChunkRegion[]): ChunkWorldState {
  const state: ChunkWorldState = new Map();
  for (const region of regions) {
    const entry = regionFromHeader(region);
    state.set(entry.key, entry);
  }
  return state;
}

export function applyRegionScan(
  state: ChunkWorldState,
  scan: IChunkRegionScan,
): ChunkWorldState {
  const next = new Map(state);
  const entry = regionFromScan(scan);
  next.set(entry.key, entry);
  return next;
}

export function removeRegion(
  state: ChunkWorldState,
  key: string,
): ChunkWorldState {
  if (!state.has(key)) return state;
  const next = new Map(state);
  next.delete(key);
  return next;
}

export interface ChunkLookup {
  region: RegionState;
  index: number;
  present: boolean;
  chunk: IChunkSummary | null;
}

export function chunkAt(
  state: ChunkWorldState,
  x: number,
  z: number,
): ChunkLookup | null {
  const region = state.get(regionKey(regionOf(x), regionOf(z)));
  if (!region) return null;

  const index = chunkIndex(x, z);
  return {
    region,
    index,
    present: region.present[index] === 1,
    chunk: region.chunks ? region.chunks[index] : null,
  };
}

export interface ChunkBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function worldBounds(state: ChunkWorldState): ChunkBounds | null {
  let bounds: ChunkBounds | null = null;

  for (const region of state.values()) {
    if (region.presentCount === 0) continue;

    const baseX = region.x * CHUNKS_PER_REGION_AXIS;
    const baseZ = region.z * CHUNKS_PER_REGION_AXIS;

    for (let index = 0; index < CHUNKS_PER_REGION; index += 1) {
      if (!region.present[index]) continue;

      const x = baseX + (index & 31);
      const z = baseZ + (index >> 5);

      if (!bounds) {
        bounds = { minX: x, minZ: z, maxX: x, maxZ: z };
        continue;
      }

      if (x < bounds.minX) bounds.minX = x;
      if (x > bounds.maxX) bounds.maxX = x;
      if (z < bounds.minZ) bounds.minZ = z;
      if (z > bounds.maxZ) bounds.maxZ = z;
    }
  }

  return bounds;
}

export interface WorldTotals {
  regions: number;
  scannedRegions: number;
  chunks: number;
  sizeBytes: number;
  problems: number;
  unsupported: number;
  statusCounts: Record<string, number>;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  maxInhabited: number;
  maxSectors: number;
  /** The data version most chunks were saved with. */
  dominantDataVersion: number | null;
  dataVersions: { version: number; count: number }[];
}

export function summarizeWorld(state: ChunkWorldState): WorldTotals {
  const totals: WorldTotals = {
    regions: 0,
    scannedRegions: 0,
    chunks: 0,
    sizeBytes: 0,
    problems: 0,
    unsupported: 0,
    statusCounts: {},
    minTimestamp: null,
    maxTimestamp: null,
    maxInhabited: 0,
    maxSectors: 0,
    dominantDataVersion: null,
    dataVersions: [],
  };
  const versions = new Map<number, number>();

  for (const region of state.values()) {
    totals.regions += 1;
    totals.chunks += region.presentCount;
    totals.sizeBytes += region.sizeBytes;
    if (!region.scanned || !region.chunks) continue;

    totals.scannedRegions += 1;
    totals.problems += region.problems;

    for (const chunk of region.chunks) {
      if (!chunk) continue;

      if (chunk.problem === "unsupported") totals.unsupported += 1;
      if (chunk.status) {
        totals.statusCounts[chunk.status] =
          (totals.statusCounts[chunk.status] ?? 0) + 1;
      }
      if (chunk.timestamp > 0) {
        totals.minTimestamp =
          totals.minTimestamp === null
            ? chunk.timestamp
            : Math.min(totals.minTimestamp, chunk.timestamp);
        totals.maxTimestamp =
          totals.maxTimestamp === null
            ? chunk.timestamp
            : Math.max(totals.maxTimestamp, chunk.timestamp);
      }
      if (chunk.inhabitedTime !== null) {
        totals.maxInhabited = Math.max(
          totals.maxInhabited,
          chunk.inhabitedTime,
        );
      }
      totals.maxSectors = Math.max(totals.maxSectors, chunk.sectors);
      if (chunk.dataVersion !== null) {
        versions.set(
          chunk.dataVersion,
          (versions.get(chunk.dataVersion) ?? 0) + 1,
        );
      }
    }
  }

  totals.dataVersions = [...versions.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count || b.version - a.version);
  totals.dominantDataVersion = totals.dataVersions[0]?.version ?? null;

  return totals;
}

export function regionsCovering(
  state: ChunkWorldState,
  bounds: ChunkBounds,
): RegionState[] {
  const found: RegionState[] = [];
  const rx0 = regionOf(bounds.minX);
  const rx1 = regionOf(bounds.maxX);
  const rz0 = regionOf(bounds.minZ);
  const rz1 = regionOf(bounds.maxZ);

  for (const region of state.values()) {
    if (region.x < rx0 || region.x > rx1 || region.z < rz0 || region.z > rz1) {
      continue;
    }
    found.push(region);
  }

  return found;
}
