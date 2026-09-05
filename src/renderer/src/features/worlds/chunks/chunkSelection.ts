import {
  CHUNKS_PER_REGION,
  CHUNKS_PER_REGION_AXIS,
  IChunkSummary,
} from "@/types/WorldChunks";
import {
  ChunkBounds,
  ChunkWorldState,
  RegionState,
  chunkIndex,
  isRealProblem,
  parseRegionKey,
  regionKey,
  regionOf,
  regionsCovering,
} from "./chunkModel";

/** Selected chunks, one flag tile per region. Treated as immutable. */
export type ChunkSelection = ReadonlyMap<string, Uint8Array>;

export type SelectMode = "replace" | "add" | "subtract" | "toggle";

export function emptySelection(): ChunkSelection {
  return new Map();
}

export function selectionCount(selection: ChunkSelection): number {
  let count = 0;
  for (const tile of selection.values()) {
    for (let index = 0; index < tile.length; index += 1) count += tile[index];
  }
  return count;
}

export function isSelected(
  selection: ChunkSelection,
  x: number,
  z: number,
): boolean {
  const tile = selection.get(regionKey(regionOf(x), regionOf(z)));
  return tile ? tile[chunkIndex(x, z)] === 1 : false;
}

class SelectionDraft {
  private readonly tiles = new Map<string, Uint8Array>();
  private readonly touched = new Set<string>();

  constructor(base: ChunkSelection) {
    for (const [key, tile] of base) this.tiles.set(key, tile);
  }

  private tileFor(key: string, create: boolean): Uint8Array | null {
    let tile = this.tiles.get(key) ?? null;

    if (!tile) {
      if (!create) return null;
      tile = new Uint8Array(CHUNKS_PER_REGION);
      this.tiles.set(key, tile);
      this.touched.add(key);
      return tile;
    }

    if (!this.touched.has(key)) {
      tile = new Uint8Array(tile);
      this.tiles.set(key, tile);
      this.touched.add(key);
    }

    return tile;
  }

  apply(key: string, index: number, mode: "add" | "subtract" | "toggle"): void {
    if (mode === "add") {
      const tile = this.tileFor(key, true);
      if (tile) tile[index] = 1;
      return;
    }

    if (mode === "subtract") {
      const tile = this.tileFor(key, false);
      if (tile && tile[index]) tile[index] = 0;
      return;
    }

    const tile = this.tileFor(key, true);
    if (tile) tile[index] = tile[index] ? 0 : 1;
  }

  finish(): ChunkSelection {
    for (const key of this.touched) {
      const tile = this.tiles.get(key);
      if (tile && !tile.some((flag) => flag === 1)) this.tiles.delete(key);
    }
    return this.tiles;
  }
}

function effectiveMode(mode: SelectMode): {
  base: (selection: ChunkSelection) => ChunkSelection;
  op: "add" | "subtract" | "toggle";
} {
  if (mode === "replace") return { base: emptySelection, op: "add" };
  return { base: (selection) => selection, op: mode };
}

export function setChunks(
  selection: ChunkSelection,
  coords: Iterable<readonly [number, number]>,
  mode: SelectMode,
): ChunkSelection {
  const { base, op } = effectiveMode(mode);
  const draft = new SelectionDraft(base(selection));

  for (const [x, z] of coords) {
    draft.apply(regionKey(regionOf(x), regionOf(z)), chunkIndex(x, z), op);
  }

  return draft.finish();
}

function normalizeBounds(bounds: ChunkBounds): ChunkBounds {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    maxX: Math.max(bounds.minX, bounds.maxX),
    minZ: Math.min(bounds.minZ, bounds.maxZ),
    maxZ: Math.max(bounds.minZ, bounds.maxZ),
  };
}

function forEachPresentIn(
  state: ChunkWorldState,
  bounds: ChunkBounds,
  visit: (region: RegionState, index: number, x: number, z: number) => void,
): void {
  const area = normalizeBounds(bounds);

  for (const region of regionsCovering(state, area)) {
    const baseX = region.x * CHUNKS_PER_REGION_AXIS;
    const baseZ = region.z * CHUNKS_PER_REGION_AXIS;
    const x0 = Math.max(0, area.minX - baseX);
    const x1 = Math.min(CHUNKS_PER_REGION_AXIS - 1, area.maxX - baseX);
    const z0 = Math.max(0, area.minZ - baseZ);
    const z1 = Math.min(CHUNKS_PER_REGION_AXIS - 1, area.maxZ - baseZ);

    for (let lz = z0; lz <= z1; lz += 1) {
      for (let lx = x0; lx <= x1; lx += 1) {
        const index = (lz << 5) | lx;
        if (!region.present[index]) continue;
        visit(region, index, baseX + lx, baseZ + lz);
      }
    }
  }
}

/** Selects the present chunks inside a rectangle given in chunk coordinates. */
export function selectRect(
  selection: ChunkSelection,
  state: ChunkWorldState,
  bounds: ChunkBounds,
  mode: SelectMode,
): ChunkSelection {
  const { base, op } = effectiveMode(mode);
  const draft = new SelectionDraft(base(selection));

  forEachPresentIn(state, bounds, (region, index) => {
    draft.apply(region.key, index, op);
  });

  return draft.finish();
}

/** Selects the present chunks whose centre lies within `radius` chunks of a point. */
export function selectRadius(
  selection: ChunkSelection,
  state: ChunkWorldState,
  center: { x: number; z: number },
  radius: number,
  mode: SelectMode,
): ChunkSelection {
  const { base, op } = effectiveMode(mode);
  const draft = new SelectionDraft(base(selection));
  const reach = Math.ceil(radius);
  const limit = radius * radius;

  forEachPresentIn(
    state,
    {
      minX: Math.floor(center.x - reach),
      maxX: Math.ceil(center.x + reach),
      minZ: Math.floor(center.z - reach),
      maxZ: Math.ceil(center.z + reach),
    },
    (region, index, x, z) => {
      const dx = x + 0.5 - center.x;
      const dz = z + 0.5 - center.z;
      if (dx * dx + dz * dz > limit) return;
      draft.apply(region.key, index, op);
    },
  );

  return draft.finish();
}

/** Selects scanned chunks that satisfy the predicate. */
export function selectWhere(
  selection: ChunkSelection,
  state: ChunkWorldState,
  predicate: (chunk: IChunkSummary) => boolean,
  mode: SelectMode,
): ChunkSelection {
  const { base, op } = effectiveMode(mode);
  const draft = new SelectionDraft(base(selection));

  for (const region of state.values()) {
    if (!region.chunks) continue;
    for (let index = 0; index < region.chunks.length; index += 1) {
      const chunk = region.chunks[index];
      if (chunk && predicate(chunk)) draft.apply(region.key, index, op);
    }
  }

  return draft.finish();
}

export function selectAll(state: ChunkWorldState): ChunkSelection {
  const tiles = new Map<string, Uint8Array>();
  for (const region of state.values()) {
    if (region.presentCount > 0)
      tiles.set(region.key, new Uint8Array(region.present));
  }
  return tiles;
}

export function invertSelection(
  selection: ChunkSelection,
  state: ChunkWorldState,
): ChunkSelection {
  const tiles = new Map<string, Uint8Array>();

  for (const region of state.values()) {
    if (region.presentCount === 0) continue;

    const current = selection.get(region.key);
    const tile = new Uint8Array(CHUNKS_PER_REGION);
    let any = false;

    for (let index = 0; index < CHUNKS_PER_REGION; index += 1) {
      if (region.present[index] && !(current && current[index])) {
        tile[index] = 1;
        any = true;
      }
    }

    if (any) tiles.set(region.key, tile);
  }

  return tiles;
}

/** Drops chunks that are no longer present in the world state. */
export function pruneSelection(
  selection: ChunkSelection,
  state: ChunkWorldState,
): ChunkSelection {
  const tiles = new Map<string, Uint8Array>();

  for (const [key, tile] of selection) {
    const region = state.get(key);
    if (!region) continue;

    let changed = false;
    let any = false;
    const next = new Uint8Array(tile);

    for (let index = 0; index < CHUNKS_PER_REGION; index += 1) {
      if (!next[index]) continue;
      if (region.present[index]) any = true;
      else {
        next[index] = 0;
        changed = true;
      }
    }

    if (any) tiles.set(key, changed ? next : tile);
  }

  return tiles;
}

export function forEachSelected(
  selection: ChunkSelection,
  visit: (x: number, z: number, key: string, index: number) => void,
): void {
  for (const [key, tile] of selection) {
    const { x: rx, z: rz } = parseRegionKey(key);
    const baseX = rx * CHUNKS_PER_REGION_AXIS;
    const baseZ = rz * CHUNKS_PER_REGION_AXIS;

    for (let index = 0; index < tile.length; index += 1) {
      if (tile[index])
        visit(baseX + (index & 31), baseZ + (index >> 5), key, index);
    }
  }
}

/** Flat `[x, z, x, z, …]` list, the shape the main process accepts. */
export function selectionCoords(selection: ChunkSelection): number[] {
  const coords: number[] = [];
  forEachSelected(selection, (x, z) => {
    coords.push(x, z);
  });
  return coords;
}

export function selectionBounds(selection: ChunkSelection): ChunkBounds | null {
  let bounds: ChunkBounds | null = null;

  forEachSelected(selection, (x, z) => {
    if (!bounds) {
      bounds = { minX: x, minZ: z, maxX: x, maxZ: z };
      return;
    }
    if (x < bounds.minX) bounds.minX = x;
    if (x > bounds.maxX) bounds.maxX = x;
    if (z < bounds.minZ) bounds.minZ = z;
    if (z > bounds.maxZ) bounds.maxZ = z;
  });

  return bounds;
}

export interface SelectionStats {
  count: number;
  regions: number;
  sizeBytes: number;
  problems: number;
  /** Selected chunks whose region has not been scanned yet. */
  unscanned: number;
  inhabitedTicks: number;
}

export function selectionStats(
  selection: ChunkSelection,
  state: ChunkWorldState,
): SelectionStats {
  const stats: SelectionStats = {
    count: 0,
    regions: 0,
    sizeBytes: 0,
    problems: 0,
    unscanned: 0,
    inhabitedTicks: 0,
  };

  for (const [key, tile] of selection) {
    const region = state.get(key);
    let inRegion = 0;

    for (let index = 0; index < tile.length; index += 1) {
      if (!tile[index]) continue;
      inRegion += 1;

      const chunk = region?.chunks?.[index] ?? null;
      if (!region?.scanned) stats.unscanned += 1;
      if (chunk) {
        stats.sizeBytes += chunk.sectors * 4096;
        stats.inhabitedTicks += chunk.inhabitedTime ?? 0;
        if (isRealProblem(chunk)) stats.problems += 1;
      }
    }

    if (inRegion > 0) {
      stats.count += inRegion;
      stats.regions += 1;
    }
  }

  return stats;
}
