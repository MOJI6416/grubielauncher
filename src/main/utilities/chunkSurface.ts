/**
 * Top-down "satellite" rendering of chunks: for every block column the first
 * block that is not see-through decides the pixel, water is tinted by depth
 * and the whole region gets relief shading from height differences.
 */
import { deserialize } from "@xmcl/nbt";
import {
  BiomeTint,
  BlockPaint,
  BlockRgb,
  DEFAULT_TINT,
  biomeTint,
  paintForBlock,
  resolvePaint,
} from "@/shared/blockColors";
import { CHUNKS_PER_REGION_AXIS } from "@/types/WorldChunks";
import { paletteEntryName } from "./chunkNbt";
import {
  LegacyBlockNames,
  byteArray,
  legacyBiomeId,
  legacyBiomeName,
  legacyBlockName,
  nibble,
} from "./legacyChunks";

export const CHUNK_PIXELS = 16;
export const REGION_PIXELS = CHUNK_PIXELS * CHUNKS_PER_REGION_AXIS;
export const COLUMNS = CHUNK_PIXELS * CHUNK_PIXELS;

/** Height of a column with nothing in it. */
export const EMPTY_HEIGHT = -32768;

/** First data version with non-spanning packed arrays (20w17a, 1.16). */
const NON_SPANNING_DATA_VERSION = 2529;

const UNSUPPORTED_RGB: BlockRgb = [70, 70, 78];
const MAX_WATER_DEPTH = 64;
const SECTION_BLOCKS = 4096;
const MCREGION_HEIGHT = 128;
const LEGACY_CELL_LAYERS = 64;

const LOOKING = 0;
const UNDER_WATER = 1;
const DONE = 2;
const ABOVE_ROOF = 3;
const IN_ROOF = 4;

export interface ChunkColumns {
  /** RGB per column, row-major by z then x. */
  colors: Uint8Array;
  /** Y of the block that decided the pixel, or EMPTY_HEIGHT. */
  heights: Int16Array;
  /** Water blocks above the floor, 0 for dry columns. */
  water: Uint8Array;
}

export interface ChunkRenderOptions {
  ceiling?: boolean;
  legacyBlocks?: LegacyBlockNames | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  return null;
}

/** Splits 64-bit longs into little-endian 32-bit words for cheap bit reads. */
function toWords(longs: unknown[]): Uint32Array {
  const words = new Uint32Array(longs.length * 2);
  const mask = 0xffffffffn;

  for (let index = 0; index < longs.length; index += 1) {
    const raw = longs[index];
    const value =
      typeof raw === "bigint"
        ? BigInt.asUintN(64, raw)
        : BigInt.asUintN(64, BigInt(Math.trunc(Number(raw) || 0)));
    words[index * 2] = Number(value & mask);
    words[index * 2 + 1] = Number((value >> 32n) & mask);
  }

  return words;
}

function readBits(words: Uint32Array, bitOffset: number, bits: number): number {
  const wordIndex = bitOffset >>> 5;
  const shift = bitOffset & 31;
  const mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1;

  if (wordIndex >= words.length) return 0;

  let value = words[wordIndex] >>> shift;
  if (shift + bits > 32 && wordIndex + 1 < words.length) {
    value |= words[wordIndex + 1] << (32 - shift);
  }

  return (value & mask) >>> 0;
}

/**
 * Unpacks `count` palette indices from a packed long array.
 *
 * @param spanning Whether entries may straddle two longs (before 1.16).
 */
export function unpackIndices(
  longs: unknown[],
  bits: number,
  count: number,
  spanning: boolean,
): Uint16Array {
  const words = toWords(longs);
  const result = new Uint16Array(count);
  const perLong = Math.floor(64 / bits);

  for (let index = 0; index < count; index += 1) {
    const offset = spanning
      ? index * bits
      : Math.floor(index / perLong) * 64 + (index % perLong) * bits;
    result[index] = readBits(words, offset, bits);
  }

  return result;
}

export function bitsForPalette(size: number, minimum: number): number {
  return Math.max(minimum, Math.ceil(Math.log2(Math.max(1, size))));
}

interface DecodedSection {
  y: number;
  palette: BlockPaint[];
  /** Palette index per block (y*256 + z*16 + x), or null when uniform. */
  blocks: Uint16Array | null;
  biomes: BiomeTint[] | null;
  /** Biome palette index per 4×4×4 cell, or null when uniform. */
  biomeCells: Uint16Array | null;
}

function paletteNames(palette: unknown): string[] {
  if (!Array.isArray(palette)) return [];
  return palette.map((entry) => paletteEntryName(entry) ?? "minecraft:air");
}

function decodeSection(
  section: Record<string, unknown>,
  spanning: boolean,
): DecodedSection | null {
  const y = toNumber(section.Y);
  if (y === null) return null;

  const states = isRecord(section.block_states) ? section.block_states : null;
  const names = paletteNames(states?.palette ?? section.Palette);
  if (names.length === 0) return null;

  const palette = names.map(paintForBlock);
  const data = states?.data ?? section.BlockStates;

  let blocks: Uint16Array | null = null;
  if (Array.isArray(data) && data.length > 0 && palette.length > 1) {
    blocks = unpackIndices(
      data,
      bitsForPalette(palette.length, 4),
      SECTION_BLOCKS,
      spanning,
    );
  }

  const biomeContainer = isRecord(section.biomes) ? section.biomes : null;
  const biomeNames = paletteNames(biomeContainer?.palette);
  const biomes = biomeNames.length
    ? biomeNames.map((name) => biomeTint(name))
    : null;

  let biomeCells: Uint16Array | null = null;
  const biomeData = biomeContainer?.data;
  if (
    biomes &&
    Array.isArray(biomeData) &&
    biomeData.length > 0 &&
    biomes.length > 1
  ) {
    biomeCells = unpackIndices(
      biomeData,
      bitsForPalette(biomes.length, 1),
      64,
      false,
    );
  }

  return { y, palette, blocks, biomes, biomeCells };
}

class LegacyPalette {
  readonly paints: BlockPaint[] = [];
  private readonly slots = new Map<number, number>();

  constructor(private readonly registry: LegacyBlockNames | null) {}

  slot(id: number, data: number): number {
    const key = id * 16 + data;
    let slot = this.slots.get(key);
    if (slot === undefined) {
      slot = this.paints.length;
      this.paints.push(paintForBlock(legacyBlockName(id, data, this.registry)));
      this.slots.set(key, slot);
    }
    return slot;
  }
}

function decodeLegacySection(
  section: Record<string, unknown>,
  registry: LegacyBlockNames | null,
): DecodedSection | null {
  const y = toNumber(section.Y);
  const ids = byteArray(section.Blocks);
  if (y === null || !ids || ids.length < SECTION_BLOCKS) return null;

  const add = byteArray(section.Add);
  const data = byteArray(section.Data);
  const palette = new LegacyPalette(registry);
  const blocks = new Uint16Array(SECTION_BLOCKS);

  for (let index = 0; index < SECTION_BLOCKS; index += 1) {
    const id = (ids[index] & 0xff) | (add ? nibble(add, index) << 8 : 0);
    blocks[index] = palette.slot(id, data ? nibble(data, index) : 0);
  }

  return {
    y,
    palette: palette.paints,
    blocks: palette.paints.length > 1 ? blocks : null,
    biomes: null,
    biomeCells: null,
  };
}

function decodeMcRegionBlocks(
  level: Record<string, unknown>,
  registry: LegacyBlockNames | null,
): DecodedSection[] | null {
  const ids = byteArray(level.Blocks);
  if (!ids || ids.length < COLUMNS * MCREGION_HEIGHT) return null;

  const data = byteArray(level.Data);
  const sections: DecodedSection[] = [];

  for (let sectionY = 0; sectionY < MCREGION_HEIGHT / 16; sectionY += 1) {
    const palette = new LegacyPalette(registry);
    const blocks = new Uint16Array(SECTION_BLOCKS);

    for (let localY = 0; localY < 16; localY += 1) {
      const y = sectionY * 16 + localY;
      for (let z = 0; z < 16; z += 1) {
        for (let x = 0; x < 16; x += 1) {
          const source = (x << 11) | (z << 7) | y;
          blocks[(localY << 8) | (z << 4) | x] = palette.slot(
            ids[source] & 0xff,
            data ? nibble(data, source) : 0,
          );
        }
      }
    }

    sections.push({
      y: sectionY,
      palette: palette.paints,
      blocks: palette.paints.length > 1 ? blocks : null,
      biomes: null,
      biomeCells: null,
    });
  }

  return sections;
}

interface LegacyBiomes {
  tints: BiomeTint[];
  layered: boolean;
}

function decodeLegacyBiomes(value: unknown): LegacyBiomes | null {
  if (!Array.isArray(value)) return null;
  if (value.length !== COLUMNS && value.length !== COLUMNS * 4) return null;

  const cache = new Map<number, BiomeTint>();
  const tints = value.map((raw) => {
    const id = legacyBiomeId(raw);
    if (id === null) return DEFAULT_TINT;
    let tint = cache.get(id);
    if (!tint) {
      tint = biomeTint(legacyBiomeName(id));
      cache.set(id, tint);
    }
    return tint;
  });

  return { tints, layered: value.length === COLUMNS * 4 };
}

function legacyTintAt(
  biomes: LegacyBiomes,
  column: number,
  worldY: number,
): BiomeTint {
  if (!biomes.layered) return biomes.tints[column] ?? DEFAULT_TINT;

  const layer = Math.min(LEGACY_CELL_LAYERS - 1, Math.max(0, worldY >> 2));
  const x = column & 15;
  const z = column >> 4;
  return (
    biomes.tints[(layer << 4) | ((z >> 2) << 2) | (x >> 2)] ?? DEFAULT_TINT
  );
}

function mix(a: BlockRgb, b: BlockRgb, t: number): BlockRgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function decodeSections(
  data: Record<string, unknown>,
  dataVersion: number,
  registry: LegacyBlockNames | null,
): DecodedSection[] | null {
  const rawSections = Array.isArray(data.sections)
    ? data.sections
    : Array.isArray(data.Sections)
      ? data.Sections
      : null;

  if (!rawSections) return decodeMcRegionBlocks(data, registry);

  const spanning = dataVersion < NON_SPANNING_DATA_VERSION;
  const sections: DecodedSection[] = [];

  for (const raw of rawSections) {
    if (!isRecord(raw)) continue;

    const decoded =
      raw.block_states || raw.Palette
        ? decodeSection(raw, spanning)
        : raw.Blocks
          ? decodeLegacySection(raw, registry)
          : null;
    if (decoded) sections.push(decoded);
  }

  return sections;
}

/**
 * Resolves the top-down colour of every column of a chunk.
 * Returns null for chunks in a layout the renderer cannot read.
 */
export function renderChunkColumns(
  nbt: unknown,
  options: ChunkRenderOptions = {},
): ChunkColumns | null {
  if (!isRecord(nbt)) return null;

  const level = isRecord(nbt.Level) ? nbt.Level : null;
  const data = level ?? nbt;
  const dataVersion = toNumber(nbt.DataVersion) ?? 0;

  const sections = decodeSections(
    data,
    dataVersion,
    options.legacyBlocks ?? null,
  );
  if (!sections) return null;
  sections.sort((a, b) => b.y - a.y);

  const legacyBiomes = decodeLegacyBiomes(data.Biomes);
  const ceiling = options.ceiling === true;

  const colors = new Uint8Array(COLUMNS * 3);
  const heights = new Int16Array(COLUMNS).fill(EMPTY_HEIGHT);
  const water = new Uint8Array(COLUMNS);

  const state = new Uint8Array(COLUMNS).fill(ceiling ? ABOVE_ROOF : LOOKING);
  const waterTop = new Int16Array(COLUMNS);
  const waterTint: BlockRgb[] = new Array(COLUMNS);
  const roofRgb: (BlockRgb | null)[] = new Array(COLUMNS).fill(null);
  const roofTop = new Int16Array(COLUMNS);
  let unresolved = COLUMNS;

  const paint = (column: number, rgb: BlockRgb, height: number) => {
    colors[column * 3] = rgb[0];
    colors[column * 3 + 1] = rgb[1];
    colors[column * 3 + 2] = rgb[2];
    heights[column] = height;
  };

  for (const section of sections) {
    if (unresolved === 0) break;

    const uniform = section.blocks === null ? section.palette[0] : null;
    const seeThrough =
      (uniform !== null && uniform.kind === "transparent") ||
      section.palette.every((entry) => entry.kind === "transparent");

    if (seeThrough) {
      if (ceiling) {
        for (let column = 0; column < COLUMNS; column += 1) {
          if (state[column] === IN_ROOF) state[column] = LOOKING;
        }
      }
      continue;
    }

    for (let column = 0; column < COLUMNS; column += 1) {
      if (state[column] === DONE) continue;

      const x = column & 15;
      const z = column >> 4;

      for (let localY = 15; localY >= 0; localY -= 1) {
        const block =
          uniform ??
          section.palette[section.blocks![(localY << 8) | (z << 4) | x]] ??
          section.palette[0];
        const worldY = section.y * 16 + localY;
        const current = state[column];

        if (current === ABOVE_ROOF || current === IN_ROOF) {
          if (block.kind === "transparent") {
            if (current === IN_ROOF) state[column] = LOOKING;
            continue;
          }
          if (current === ABOVE_ROOF) {
            state[column] = IN_ROOF;
            roofRgb[column] = resolvePaint(block, DEFAULT_TINT) ?? null;
            roofTop[column] = worldY;
          }
          continue;
        }

        if (block.kind === "transparent") continue;

        const tint = section.biomes
          ? (section.biomes[
              section.biomeCells
                ? section.biomeCells[
                    ((localY >> 2) << 4) | ((z >> 2) << 2) | (x >> 2)
                  ]
                : 0
            ] ?? section.biomes[0])
          : legacyBiomes
            ? legacyTintAt(legacyBiomes, column, worldY)
            : DEFAULT_TINT;

        if (current === LOOKING) {
          if (block.kind === "water") {
            state[column] = UNDER_WATER;
            waterTop[column] = worldY;
            waterTint[column] = tint.water;
            water[column] = 1;
            continue;
          }

          paint(column, resolvePaint(block, tint) ?? UNSUPPORTED_RGB, worldY);
          state[column] = DONE;
          unresolved -= 1;
          break;
        }

        if (block.kind === "water") {
          if (water[column] < MAX_WATER_DEPTH) water[column] += 1;
          continue;
        }

        const floor = resolvePaint(block, tint) ?? UNSUPPORTED_RGB;
        const depth = water[column];
        const blend = Math.min(0.9, 0.45 + depth * 0.04);
        paint(column, mix(floor, waterTint[column], blend), waterTop[column]);
        state[column] = DONE;
        unresolved -= 1;
        break;
      }
    }
  }

  for (let column = 0; column < COLUMNS; column += 1) {
    if (state[column] === UNDER_WATER) {
      paint(
        column,
        mix(waterTint[column], [10, 20, 60], 0.5),
        waterTop[column],
      );
      continue;
    }

    const roof = roofRgb[column];
    if (state[column] !== DONE && roof) paint(column, roof, roofTop[column]);
  }

  return { colors, heights, water };
}

export async function renderChunkColumnsFromNbt(
  payload: Buffer,
  options: ChunkRenderOptions = {},
): Promise<ChunkColumns | null> {
  const nbt: unknown = await deserialize(new Uint8Array(payload));
  return renderChunkColumns(nbt, options);
}

export type RegionColumns = Map<number, ChunkColumns | null>;

/**
 * Composes chunk columns into a 512×512 RGBA image with relief shading.
 * Chunks mapped to `null` are painted as unsupported, missing ones stay clear.
 */
export function composeRegionSurface(chunks: RegionColumns): Uint8ClampedArray {
  const size = REGION_PIXELS;
  const rgba = new Uint8ClampedArray(size * size * 4);
  const heights = new Int16Array(size * size).fill(EMPTY_HEIGHT);
  const water = new Uint8Array(size * size);

  for (const [index, columns] of chunks) {
    const originX = (index & 31) * CHUNK_PIXELS;
    const originZ = (index >> 5) * CHUNK_PIXELS;

    for (let column = 0; column < COLUMNS; column += 1) {
      const px = originX + (column & 15);
      const pz = originZ + (column >> 4);
      const pixel = pz * size + px;

      if (!columns) {
        rgba[pixel * 4] = UNSUPPORTED_RGB[0];
        rgba[pixel * 4 + 1] = UNSUPPORTED_RGB[1];
        rgba[pixel * 4 + 2] = UNSUPPORTED_RGB[2];
        rgba[pixel * 4 + 3] = 255;
        continue;
      }

      const height = columns.heights[column];
      if (height === EMPTY_HEIGHT) continue;

      rgba[pixel * 4] = columns.colors[column * 3];
      rgba[pixel * 4 + 1] = columns.colors[column * 3 + 1];
      rgba[pixel * 4 + 2] = columns.colors[column * 3 + 2];
      rgba[pixel * 4 + 3] = 255;
      heights[pixel] = height;
      water[pixel] = columns.water[column];
    }
  }

  for (let pz = 0; pz < size; pz += 1) {
    for (let px = 0; px < size; px += 1) {
      const pixel = pz * size + px;
      const height = heights[pixel];
      if (height === EMPTY_HEIGHT || rgba[pixel * 4 + 3] === 0) continue;

      const north = pz > 0 ? heights[pixel - size] : EMPTY_HEIGHT;
      const west = px > 0 ? heights[pixel - 1] : EMPTY_HEIGHT;
      const northDelta = north === EMPTY_HEIGHT ? 0 : height - north;
      const westDelta = west === EMPTY_HEIGHT ? 0 : height - west;

      let delta = northDelta + westDelta;
      if (delta > 6) delta = 6;
      if (delta < -6) delta = -6;

      let factor = 1 + delta * 0.045;
      factor *= 1 + Math.max(-0.08, Math.min(0.12, (height - 64) / 512));
      if (water[pixel] > 0) factor *= 1 - Math.min(0.35, water[pixel] * 0.012);

      rgba[pixel * 4] = rgba[pixel * 4] * factor;
      rgba[pixel * 4 + 1] = rgba[pixel * 4 + 1] * factor;
      rgba[pixel * 4 + 2] = rgba[pixel * 4 + 2] * factor;
    }
  }

  return rgba;
}
