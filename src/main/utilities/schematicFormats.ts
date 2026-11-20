import { ISchematicDetails, SchematicFormat } from "@/types/Schematic";
import { formatBlockState } from "@/shared/blockState";
import {
  NbtCompound,
  NbtValue,
  isNbtCompound,
  isNbtLongArray,
  nbtNumber,
  nbtString,
} from "./nbtTree";
import {
  legacyBlockState,
  modernizeBlockState,
  paletteIsLegacy,
} from "./schematicLegacy";

export type CellVisitor = (x: number, y: number, z: number, state: number) => void;

export interface SchematicSource {
  details: ISchematicDetails;
  palette: string[];
  cells: number;
  histogram(): Float64Array;
  visit(visitor: CellVisitor): void;
}

const AIR_STATE = "minecraft:air";

function list(value: NbtValue | undefined): NbtValue[] {
  return Array.isArray(value) ? value : [];
}

function listLength(value: NbtValue | undefined): number | null {
  return Array.isArray(value) ? value.length : null;
}

function axis(value: NbtValue | undefined, key: string): number {
  if (!isNbtCompound(value)) return 0;
  return nbtNumber(value[key]) ?? 0;
}

function nonEmpty(value: string | null): string | null {
  return value && value.trim() ? value.trim() : null;
}

export function paletteState(entry: NbtValue): string | null {
  if (typeof entry === "string") return entry;
  if (!isNbtCompound(entry)) return null;
  const name = nbtString(entry.Name) ?? nbtString(entry[""]);
  if (!name) return null;
  const properties = isNbtCompound(entry.Properties) ? entry.Properties : null;
  if (!properties) return name;
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" || typeof value === "number") {
      props[key] = String(value);
    }
  }
  return formatBlockState(name, props);
}

function modernize(states: (string | null)[], dataVersion: number | null) {
  if (!paletteIsLegacy(dataVersion, states)) return states;
  return states.map((state) => (state ? modernizeBlockState(state) : state));
}

export function emptyDetails(format: SchematicFormat): ISchematicDetails {
  return {
    format,
    formatVersion: null,
    dataVersion: null,
    name: null,
    author: null,
    description: null,
    size: { x: 0, y: 0, z: 0 },
    volume: 0,
    blockCount: null,
    blockTypes: 0,
    blocks: [],
    regions: null,
    blockEntities: null,
    entities: null,
    createdAt: null,
    modifiedAt: null,
  };
}

class Palette {
  readonly states: string[] = [];
  private readonly index = new Map<string, number>();

  add(state: string | null): number {
    const key = state ?? AIR_STATE;
    const known = this.index.get(key);
    if (known !== undefined) return known;
    this.states.push(key);
    this.index.set(key, this.states.length - 1);
    return this.states.length - 1;
  }
}

export function countPackedIndices(
  words: Uint32Array,
  bits: number,
  cells: number,
  buckets: number,
): Float64Array {
  const counts = new Float64Array(buckets);
  forEachPacked(words, bits, cells, (_, value) => {
    if (value < buckets) counts[value] += 1;
  });
  return counts;
}

export function forEachPacked(
  words: Uint32Array,
  bits: number,
  cells: number,
  visit: (index: number, value: number) => void,
) {
  if (bits <= 0 || bits > 32) return;
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  const available = Math.floor((words.length * 32) / bits);
  const total = Math.min(cells, available);

  for (let index = 0; index < total; index += 1) {
    const offset = index * bits;
    const word = Math.floor(offset / 32);
    const shift = offset % 32;
    let value = words[word] >>> shift;
    if (shift + bits > 32) value |= (words[word + 1] ?? 0) << (32 - shift);
    visit(index, (value & mask) >>> 0);
  }
}

export function countVarintIndices(
  data: Uint8Array,
  cells: number,
  buckets: number,
): Float64Array {
  const counts = new Float64Array(buckets);
  forEachVarint(data, cells, (_, value) => {
    if (value < buckets) counts[value] += 1;
  });
  return counts;
}

export function forEachVarint(
  data: Uint8Array,
  cells: number,
  visit: (index: number, value: number) => void,
) {
  let offset = 0;
  for (let cell = 0; cell < cells && offset < data.length; cell += 1) {
    let value = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = data[offset++];
      value |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80 && offset < data.length && shift < 35);
    visit(cell, value >>> 0);
  }
}

function regionBounds(position: NbtValue | undefined, size: NbtValue | undefined) {
  return (["x", "y", "z"] as const).map((key) => {
    const start = axis(position, key);
    const length = axis(size, key);
    const end = start + length - Math.sign(length || 1);
    return [Math.min(start, end), Math.max(start, end)] as const;
  });
}

function litematicSource(root: NbtCompound): SchematicSource {
  const details = emptyDetails("litematic");
  const meta = isNbtCompound(root.Metadata) ? root.Metadata : {};
  const regionsTag = isNbtCompound(root.Regions) ? root.Regions : {};

  details.formatVersion = nbtNumber(root.Version);
  details.dataVersion = nbtNumber(root.MinecraftDataVersion);
  details.name = nonEmpty(nbtString(meta.Name));
  details.author = nonEmpty(nbtString(meta.Author));
  details.description = nonEmpty(nbtString(meta.Description));
  details.createdAt = nbtNumber(meta.TimeCreated);
  details.modifiedAt = nbtNumber(meta.TimeModified);

  const regionList = Object.values(regionsTag).filter(isNbtCompound);
  details.regions = nbtNumber(meta.RegionCount) ?? regionList.length;

  const lows = [Infinity, Infinity, Infinity];
  const highs = [-Infinity, -Infinity, -Infinity];
  let cells = 0;
  let blockEntities = 0;
  let entities = 0;
  const palette = new Palette();
  palette.add(AIR_STATE);

  const regions = regionList.map((region) => {
    const bounds = regionBounds(region.Position, region.Size);
    bounds.forEach(([low, high], index) => {
      lows[index] = Math.min(lows[index], low);
      highs[index] = Math.max(highs[index], high);
    });
    const sizes = (["x", "y", "z"] as const).map((key) =>
      Math.abs(axis(region.Size, key)),
    );
    const regionCells = sizes[0] * sizes[1] * sizes[2];
    cells += regionCells;
    blockEntities += listLength(region.TileEntities) ?? 0;
    entities += listLength(region.Entities) ?? 0;

    const local = modernize(
      list(region.BlockStatePalette).map(paletteState),
      details.dataVersion,
    );
    const remap = Int32Array.from(local, (state) => palette.add(state));
    const states = region.BlockStates;
    return {
      low: bounds.map(([low]) => low),
      sizes,
      cells: regionCells,
      remap,
      words: isNbtLongArray(states) && local.length ? states.words : null,
      bits: Math.max(2, 32 - Math.clz32(Math.max(1, local.length - 1))),
    };
  });

  const enclosing = meta.EnclosingSize;
  details.size =
    isNbtCompound(enclosing) && axis(enclosing, "x") > 0
      ? {
          x: Math.abs(axis(enclosing, "x")),
          y: Math.abs(axis(enclosing, "y")),
          z: Math.abs(axis(enclosing, "z")),
        }
      : regionList.length
        ? {
            x: highs[0] - lows[0] + 1,
            y: highs[1] - lows[1] + 1,
            z: highs[2] - lows[2] + 1,
          }
        : { x: 0, y: 0, z: 0 };
  details.volume = nbtNumber(meta.TotalVolume) ?? cells;
  details.blockEntities = blockEntities;
  details.entities = entities;
  details.blockCount = nbtNumber(meta.TotalBlocks);

  return {
    details,
    palette: palette.states,
    cells,
    histogram() {
      const counts = new Float64Array(palette.states.length);
      for (const region of regions) {
        if (!region.words) continue;
        const local = countPackedIndices(
          region.words,
          region.bits,
          region.cells,
          region.remap.length,
        );
        local.forEach((count, index) => {
          counts[region.remap[index]] += count;
        });
      }
      return counts;
    },
    visit(visitor) {
      for (const region of regions) {
        if (!region.words) continue;
        const [sx, , sz] = region.sizes;
        const layer = sx * sz;
        const ox = region.low[0] - lows[0];
        const oy = region.low[1] - lows[1];
        const oz = region.low[2] - lows[2];
        forEachPacked(region.words, region.bits, region.cells, (index, value) => {
          if (value >= region.remap.length) return;
          const y = Math.floor(index / layer);
          const rest = index - y * layer;
          const z = Math.floor(rest / sx);
          visitor(ox + rest - z * sx, oy + y, oz + z, region.remap[value]);
        });
      }
    },
  };
}

function spongeRoot(root: NbtCompound): NbtCompound {
  return isNbtCompound(root.Schematic) ? root.Schematic : root;
}

function spongePalette(value: NbtValue | undefined): string[] {
  if (!isNbtCompound(value)) return [];
  const names: string[] = [];
  for (const [name, index] of Object.entries(value)) {
    if (typeof index === "number" && index >= 0 && index < 1 << 20) {
      names[index] = name;
    }
  }
  return names;
}

function boxDimensions(schematic: NbtCompound) {
  const width = (nbtNumber(schematic.Width) ?? 0) & 0xffff;
  const height = (nbtNumber(schematic.Height) ?? 0) & 0xffff;
  const length = (nbtNumber(schematic.Length) ?? 0) & 0xffff;
  return { x: width, y: height, z: length };
}

function gridVisitor(size: { x: number; z: number }, visitor: CellVisitor) {
  const layer = size.x * size.z;
  return (index: number, state: number) => {
    const y = Math.floor(index / layer);
    const rest = index - y * layer;
    const z = Math.floor(rest / size.x);
    visitor(rest - z * size.x, y, z, state);
  };
}

function spongeSource(root: NbtCompound): SchematicSource {
  const details = emptyDetails("sponge");
  const schematic = spongeRoot(root);
  const blocks = isNbtCompound(schematic.Blocks) ? schematic.Blocks : null;
  const meta = isNbtCompound(schematic.Metadata) ? schematic.Metadata : {};

  details.formatVersion = nbtNumber(schematic.Version);
  details.dataVersion = nbtNumber(schematic.DataVersion);
  details.name = nonEmpty(nbtString(meta.Name));
  details.author = nonEmpty(nbtString(meta.Author));
  details.createdAt = nbtNumber(meta.Date);
  details.size = boxDimensions(schematic);
  details.volume = details.size.x * details.size.y * details.size.z;
  details.blockEntities = listLength(
    blocks?.BlockEntities ?? schematic.BlockEntities ?? schematic.TileEntities,
  );
  details.entities = listLength(schematic.Entities);

  const local = spongePalette(blocks ? blocks.Palette : schematic.Palette);
  const data = blocks ? blocks.Data : schematic.BlockData;
  const palette = new Palette();
  palette.add(AIR_STATE);
  const remap = Int32Array.from(local, (state) => palette.add(state ?? null));
  const usable = data instanceof Uint8Array && local.length > 0;
  const cells = details.volume;

  return {
    details,
    palette: palette.states,
    cells,
    histogram() {
      const counts = new Float64Array(palette.states.length);
      if (!usable) return counts;
      countVarintIndices(data, cells, remap.length).forEach((count, index) => {
        counts[remap[index]] += count;
      });
      return counts;
    },
    visit(visitor) {
      if (!usable) return;
      const place = gridVisitor(details.size, visitor);
      forEachVarint(data, cells, (index, value) => {
        if (value < remap.length) place(index, remap[value]);
      });
    },
  };
}

function legacyMapping(schematic: NbtCompound): Map<number, string> {
  const mapping = new Map<number, string>();

  if (isNbtCompound(schematic.SchematicaMapping)) {
    for (const [name, id] of Object.entries(schematic.SchematicaMapping)) {
      if (typeof id === "number") mapping.set(id, name);
    }
  }

  if (isNbtCompound(schematic.BlockIDs)) {
    for (const [id, name] of Object.entries(schematic.BlockIDs)) {
      const numeric = Number(id);
      if (Number.isInteger(numeric) && typeof name === "string") {
        mapping.set(numeric, name);
      }
    }
  }

  return mapping;
}

function mceditSource(root: NbtCompound): SchematicSource {
  const details = emptyDetails("mcedit");
  const schematic = spongeRoot(root);
  details.size = boxDimensions(schematic);
  details.volume = details.size.x * details.size.y * details.size.z;
  details.blockEntities = listLength(schematic.TileEntities);
  details.entities = listLength(schematic.Entities);

  const blocks = schematic.Blocks instanceof Uint8Array ? schematic.Blocks : null;
  const add = schematic.AddBlocks instanceof Uint8Array ? schematic.AddBlocks : null;
  const meta = schematic.Data instanceof Uint8Array ? schematic.Data : null;
  const cells = blocks ? Math.min(details.volume, blocks.length) : 0;
  const mapping = legacyMapping(schematic);
  const palette = new Palette();
  palette.add(AIR_STATE);
  const keys = new Int32Array(1 << 16).fill(-1);

  const keyAt = (index: number) => {
    let id = blocks![index];
    if (add && index >> 1 < add.length) {
      const nibble =
        index & 1 ? (add[index >> 1] & 0xf0) >> 4 : add[index >> 1] & 0x0f;
      id |= nibble << 8;
    }
    const data = meta && index < meta.length ? meta[index] & 15 : 0;
    return (id << 4) | data;
  };

  const keyCounts = new Float64Array(1 << 16);
  for (let index = 0; index < cells; index += 1) keyCounts[keyAt(index)] += 1;
  keyCounts.forEach((count, key) => {
    if (count > 0) keys[key] = palette.add(legacyBlockState(key >> 4, key & 15, mapping));
  });

  return {
    details,
    palette: palette.states,
    cells,
    histogram() {
      const counts = new Float64Array(palette.states.length);
      keyCounts.forEach((count, key) => {
        if (count > 0) counts[keys[key]] += count;
      });
      return counts;
    },
    visit(visitor) {
      const place = gridVisitor(details.size, visitor);
      for (let index = 0; index < cells; index += 1) {
        place(index, keys[keyAt(index)]);
      }
    },
  };
}

function structureSource(root: NbtCompound): SchematicSource {
  const details = emptyDetails("structure");
  const size = list(root.size).map((value) => nbtNumber(value) ?? 0);

  details.dataVersion = nbtNumber(root.DataVersion);
  details.author = nonEmpty(nbtString(root.author));
  details.size = { x: size[0] ?? 0, y: size[1] ?? 0, z: size[2] ?? 0 };
  details.volume = details.size.x * details.size.y * details.size.z;
  details.entities = listLength(root.entities);

  const palettes = list(root.palettes);
  const local = modernize(
    (Array.isArray(root.palette) ? root.palette : list(palettes[0])).map(
      paletteState,
    ),
    details.dataVersion,
  );
  const palette = new Palette();
  palette.add(AIR_STATE);
  const remap = Int32Array.from(local, (state) => palette.add(state));

  const blocks: { x: number; y: number; z: number; state: number }[] = [];
  let blockEntities = 0;
  for (const block of list(root.blocks)) {
    if (!isNbtCompound(block)) continue;
    const state = nbtNumber(block.state);
    if (state === null || state < 0 || state >= remap.length) continue;
    const pos = list(block.pos).map((value) => nbtNumber(value) ?? -1);
    blocks.push({ x: pos[0], y: pos[1], z: pos[2], state: remap[state] });
    if (isNbtCompound(block.nbt)) blockEntities += 1;
  }
  details.blockEntities = blockEntities;

  return {
    details,
    palette: palette.states,
    cells: blocks.length,
    histogram() {
      const counts = new Float64Array(palette.states.length);
      for (const block of blocks) counts[block.state] += 1;
      return counts;
    },
    visit(visitor) {
      for (const block of blocks) {
        if (
          block.x < 0 ||
          block.y < 0 ||
          block.z < 0 ||
          block.x >= details.size.x ||
          block.y >= details.size.y ||
          block.z >= details.size.z
        ) {
          continue;
        }
        visitor(block.x, block.y, block.z, block.state);
      }
    },
  };
}

export function detectSchematicFormat(
  root: NbtCompound,
): SchematicFormat | null {
  if (isNbtCompound(root.Regions)) return "litematic";
  if (Array.isArray(root.size) && Array.isArray(root.blocks)) return "structure";

  const schematic = spongeRoot(root);
  if (
    isNbtCompound(schematic.Blocks) ||
    isNbtCompound(schematic.Palette) ||
    schematic.BlockData instanceof Uint8Array
  ) {
    return "sponge";
  }
  if (schematic.Blocks instanceof Uint8Array) return "mcedit";
  return null;
}

export function openSchematicSource(root: NbtCompound): SchematicSource | null {
  switch (detectSchematicFormat(root)) {
    case "litematic":
      return litematicSource(root);
    case "structure":
      return structureSource(root);
    case "sponge":
      return spongeSource(root);
    case "mcedit":
      return mceditSource(root);
    default:
      return null;
  }
}
