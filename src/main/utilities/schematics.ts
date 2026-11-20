import fs from "fs-extra";
import path from "path";
import {
  ISchematicBlock,
  ISchematicDetails,
  ISchematicFile,
  SchematicFolder,
  SchematicFormat,
  SchematicInspectResult,
  SchematicTransferResult,
} from "@/types/Schematic";
import {
  NbtCompound,
  NbtValue,
  inflateNbt,
  isNbtCompound,
  isNbtLongArray,
  nbtNumber,
  nbtString,
  readNbtTree,
} from "./nbtTree";
import { LEGACY_BLOCK_NAMES } from "./legacyBlockNames";

export const SCHEMATIC_ROOTS: { folder: SchematicFolder; segments: string[] }[] =
  [
    { folder: "schematics", segments: ["schematics"] },
    { folder: "worldedit", segments: ["config", "worldedit", "schematics"] },
  ];

const EXTENSIONS: Record<string, SchematicFormat> = {
  ".litematic": "litematic",
  ".schem": "sponge",
  ".schematic": "mcedit",
  ".nbt": "structure",
};

const MAX_DEPTH = 4;
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_INFLATED_BYTES = 512 * 1024 * 1024;
const MAX_COUNTED_CELLS = 64 * 1024 * 1024;
const MAX_LISTED_BLOCKS = 256;

const AIR = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
  "minecraft:structure_void",
]);

export function schematicFormatOf(fileName: string): SchematicFormat | null {
  return EXTENSIONS[path.extname(fileName).toLowerCase()] ?? null;
}

function withoutExtension(fileName: string): string {
  const extension = path.extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

export function blockBaseId(state: string): string {
  const trimmed = state.trim();
  const cut = trimmed.search(/[[{]/);
  const id = (cut === -1 ? trimmed : trimmed.slice(0, cut)).trim();
  return id.includes(":") ? id : `minecraft:${id}`;
}

function paletteName(entry: NbtValue): string | null {
  if (typeof entry === "string") return entry;
  if (!isNbtCompound(entry)) return null;
  const name = nbtString(entry.Name) ?? nbtString(entry[""]);
  return name;
}

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

function finishBlocks(counts: Map<string, number>): {
  blockCount: number;
  blockTypes: number;
  blocks: ISchematicBlock[];
} {
  let blockCount = 0;
  const blocks: ISchematicBlock[] = [];

  for (const [id, count] of counts) {
    if (count <= 0 || AIR.has(id)) continue;
    blockCount += count;
    blocks.push({ id, count });
  }

  blocks.sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));

  return {
    blockCount,
    blockTypes: blocks.length,
    blocks: blocks.slice(0, MAX_LISTED_BLOCKS),
  };
}

function addCount(counts: Map<string, number>, id: string, count: number) {
  if (count <= 0) return;
  counts.set(id, (counts.get(id) ?? 0) + count);
}

export function countPackedIndices(
  words: Uint32Array,
  bits: number,
  cells: number,
  buckets: number,
): Float64Array {
  const counts = new Float64Array(buckets);
  if (bits <= 0 || bits > 32) return counts;

  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  const available = Math.floor((words.length * 32) / bits);
  const total = Math.min(cells, available);

  for (let index = 0; index < total; index += 1) {
    const offset = index * bits;
    const word = Math.floor(offset / 32);
    const shift = offset % 32;
    let value = words[word] >>> shift;
    if (shift + bits > 32) value |= (words[word + 1] ?? 0) << (32 - shift);
    value = (value & mask) >>> 0;
    if (value < buckets) counts[value] += 1;
  }

  return counts;
}

export function countVarintIndices(
  data: Uint8Array,
  cells: number,
  buckets: number,
): Float64Array {
  const counts = new Float64Array(buckets);
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
    value >>>= 0;
    if (value < buckets) counts[value] += 1;
  }

  return counts;
}

function emptyDetails(format: SchematicFormat): ISchematicDetails {
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

function nonEmpty(value: string | null): string | null {
  return value && value.trim() ? value.trim() : null;
}

function regionBounds(position: NbtValue | undefined, size: NbtValue | undefined) {
  return (["x", "y", "z"] as const).map((key) => {
    const start = axis(position, key);
    const length = axis(size, key);
    const end = start + length - Math.sign(length || 1);
    return [Math.min(start, end), Math.max(start, end)] as const;
  });
}

function parseLitematic(root: NbtCompound): ISchematicDetails {
  const details = emptyDetails("litematic");
  const meta = isNbtCompound(root.Metadata) ? root.Metadata : {};
  const regions = isNbtCompound(root.Regions) ? root.Regions : {};

  details.formatVersion = nbtNumber(root.Version);
  details.dataVersion = nbtNumber(root.MinecraftDataVersion);
  details.name = nonEmpty(nbtString(meta.Name));
  details.author = nonEmpty(nbtString(meta.Author));
  details.description = nonEmpty(nbtString(meta.Description));
  details.createdAt = nbtNumber(meta.TimeCreated);
  details.modifiedAt = nbtNumber(meta.TimeModified);

  const regionList = Object.values(regions).filter(isNbtCompound);
  details.regions = nbtNumber(meta.RegionCount) ?? regionList.length;

  const lows = [Infinity, Infinity, Infinity];
  const highs = [-Infinity, -Infinity, -Infinity];
  let cellsTotal = 0;
  let blockEntities = 0;
  let entities = 0;

  for (const region of regionList) {
    const bounds = regionBounds(region.Position, region.Size);
    bounds.forEach(([low, high], index) => {
      lows[index] = Math.min(lows[index], low);
      highs[index] = Math.max(highs[index], high);
    });
    cellsTotal +=
      Math.abs(axis(region.Size, "x")) *
      Math.abs(axis(region.Size, "y")) *
      Math.abs(axis(region.Size, "z"));
    blockEntities += listLength(region.TileEntities) ?? 0;
    entities += listLength(region.Entities) ?? 0;
  }

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
  details.volume = nbtNumber(meta.TotalVolume) ?? cellsTotal;
  details.blockEntities = blockEntities;
  details.entities = entities;

  if (cellsTotal > MAX_COUNTED_CELLS) {
    details.blockCount = nbtNumber(meta.TotalBlocks);
    return details;
  }

  const counts = new Map<string, number>();
  for (const region of regionList) {
    const palette = list(region.BlockStatePalette).map(paletteName);
    const states = region.BlockStates;
    if (!palette.length || !isNbtLongArray(states)) continue;

    const cells =
      Math.abs(axis(region.Size, "x")) *
      Math.abs(axis(region.Size, "y")) *
      Math.abs(axis(region.Size, "z"));
    const bits = Math.max(2, 32 - Math.clz32(palette.length - 1));
    const indexCounts = countPackedIndices(
      states.words,
      bits,
      cells,
      palette.length,
    );
    palette.forEach((name, index) => {
      if (name) addCount(counts, blockBaseId(name), indexCounts[index]);
    });
  }

  Object.assign(details, finishBlocks(counts));
  return details;
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

function parseSponge(root: NbtCompound): ISchematicDetails {
  const details = emptyDetails("sponge");
  const schematic = spongeRoot(root);
  const blocks = isNbtCompound(schematic.Blocks) ? schematic.Blocks : null;
  const meta = isNbtCompound(schematic.Metadata) ? schematic.Metadata : {};

  details.formatVersion = nbtNumber(schematic.Version);
  details.dataVersion = nbtNumber(schematic.DataVersion);
  details.name = nonEmpty(nbtString(meta.Name));
  details.author = nonEmpty(nbtString(meta.Author));
  details.createdAt = nbtNumber(meta.Date);

  const width = (nbtNumber(schematic.Width) ?? 0) & 0xffff;
  const height = (nbtNumber(schematic.Height) ?? 0) & 0xffff;
  const length = (nbtNumber(schematic.Length) ?? 0) & 0xffff;
  details.size = { x: width, y: height, z: length };
  details.volume = width * height * length;
  details.blockEntities = listLength(
    blocks?.BlockEntities ?? schematic.BlockEntities ?? schematic.TileEntities,
  );
  details.entities = listLength(schematic.Entities);

  const palette = spongePalette(blocks ? blocks.Palette : schematic.Palette);
  const data = blocks ? blocks.Data : schematic.BlockData;
  if (!(data instanceof Uint8Array) || !palette.length) return details;
  if (details.volume > MAX_COUNTED_CELLS) return details;

  const indexCounts = countVarintIndices(data, details.volume, palette.length);
  const counts = new Map<string, number>();
  palette.forEach((name, index) => {
    if (name) addCount(counts, blockBaseId(name), indexCounts[index]);
  });

  Object.assign(details, finishBlocks(counts));
  return details;
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

export function legacyBlockName(id: number, mapping?: Map<number, string>) {
  const mapped = mapping?.get(id);
  if (mapped) return blockBaseId(mapped);
  const known = LEGACY_BLOCK_NAMES[id];
  return known ? `minecraft:${known}` : `legacy:${id}`;
}

function parseMcedit(root: NbtCompound): ISchematicDetails {
  const details = emptyDetails("mcedit");
  const schematic = spongeRoot(root);

  const width = (nbtNumber(schematic.Width) ?? 0) & 0xffff;
  const height = (nbtNumber(schematic.Height) ?? 0) & 0xffff;
  const length = (nbtNumber(schematic.Length) ?? 0) & 0xffff;
  details.size = { x: width, y: height, z: length };
  details.volume = width * height * length;
  details.blockEntities = listLength(schematic.TileEntities);
  details.entities = listLength(schematic.Entities);

  const blocks = schematic.Blocks;
  if (!(blocks instanceof Uint8Array)) return details;

  const add = schematic.AddBlocks instanceof Uint8Array ? schematic.AddBlocks : null;
  const cells = Math.min(details.volume, blocks.length);
  const byId = new Map<number, number>();

  for (let index = 0; index < cells; index += 1) {
    let id = blocks[index];
    if (add && index >> 1 < add.length) {
      const nibble =
        index & 1 ? (add[index >> 1] & 0xf0) >> 4 : add[index >> 1] & 0x0f;
      id |= nibble << 8;
    }
    byId.set(id, (byId.get(id) ?? 0) + 1);
  }

  const mapping = legacyMapping(schematic);
  const counts = new Map<string, number>();
  for (const [id, count] of byId) {
    if (id === 0) continue;
    addCount(counts, legacyBlockName(id, mapping), count);
  }

  Object.assign(details, finishBlocks(counts));
  return details;
}

function parseStructure(root: NbtCompound): ISchematicDetails {
  const details = emptyDetails("structure");
  const size = list(root.size).map((value) => nbtNumber(value) ?? 0);

  details.dataVersion = nbtNumber(root.DataVersion);
  details.author = nonEmpty(nbtString(root.author));
  details.size = { x: size[0] ?? 0, y: size[1] ?? 0, z: size[2] ?? 0 };
  details.volume = details.size.x * details.size.y * details.size.z;
  details.entities = listLength(root.entities);

  const palettes = list(root.palettes);
  const palette = (
    Array.isArray(root.palette) ? root.palette : list(palettes[0])
  ).map(paletteName);

  const byState = new Map<number, number>();
  let blockEntities = 0;
  for (const block of list(root.blocks)) {
    if (!isNbtCompound(block)) continue;
    const state = nbtNumber(block.state);
    if (state === null) continue;
    byState.set(state, (byState.get(state) ?? 0) + 1);
    if (isNbtCompound(block.nbt)) blockEntities += 1;
  }
  details.blockEntities = blockEntities;

  const counts = new Map<string, number>();
  for (const [state, count] of byState) {
    const name = palette[state];
    if (name) addCount(counts, blockBaseId(name), count);
  }

  Object.assign(details, finishBlocks(counts));
  return details;
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

export function parseSchematicNbt(root: NbtCompound): ISchematicDetails | null {
  switch (detectSchematicFormat(root)) {
    case "litematic":
      return parseLitematic(root);
    case "structure":
      return parseStructure(root);
    case "sponge":
      return parseSponge(root);
    case "mcedit":
      return parseMcedit(root);
    default:
      return null;
  }
}

export async function parseSchematicBuffer(
  data: Buffer,
): Promise<ISchematicDetails | null> {
  const inflated = await inflateNbt(data, MAX_INFLATED_BYTES);
  return parseSchematicNbt(readNbtTree(inflated).value);
}

const inspectCache = new Map<
  string,
  { size: number; mtimeMs: number; result: SchematicInspectResult }
>();
const INSPECT_CACHE_LIMIT = 64;

export async function inspectSchematic(
  filePath: string,
): Promise<SchematicInspectResult> {
  const resolved = path.resolve(filePath);
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats?.isFile()) return { ok: false, error: "missing" };
  if (stats.size > MAX_FILE_BYTES) return { ok: false, error: "tooLarge" };

  const cached = inspectCache.get(resolved);
  if (cached && cached.size === stats.size && cached.mtimeMs === stats.mtimeMs) {
    return cached.result;
  }

  let result: SchematicInspectResult;
  try {
    const details = await parseSchematicBuffer(await fs.readFile(resolved));
    result = details
      ? { ok: true, details }
      : { ok: false, error: "unreadable" };
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof RangeError ? "tooLarge" : "unreadable",
    };
    if (!(error instanceof RangeError)) {
      console.warn("[schematics] cannot read", resolved, error);
    }
  }

  if (inspectCache.size >= INSPECT_CACHE_LIMIT) {
    const oldest = inspectCache.keys().next().value;
    if (oldest !== undefined) inspectCache.delete(oldest);
  }
  inspectCache.set(resolved, {
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    result,
  });

  return result;
}

async function walk(
  directory: string,
  relative: string[],
  depth: number,
  visit: (fullPath: string, relative: string[], stats: fs.Stats) => void,
  budget: { left: number },
): Promise<void> {
  if (depth > MAX_DEPTH || budget.left <= 0) return;

  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (budget.left <= 0) return;
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath, [...relative, entry.name], depth + 1, visit, budget);
      continue;
    }

    if (!entry.isFile() || !schematicFormatOf(entry.name)) continue;
    const stats = await fs.stat(fullPath).catch(() => null);
    if (!stats?.isFile()) continue;
    budget.left -= 1;
    visit(fullPath, [...relative, entry.name], stats);
  }
}

export async function listSchematics(
  versionPath: string,
): Promise<ISchematicFile[]> {
  const root = path.resolve(versionPath);
  const files: ISchematicFile[] = [];
  const budget = { left: MAX_FILES };

  for (const { folder, segments } of SCHEMATIC_ROOTS) {
    await walk(
      path.join(root, ...segments),
      segments,
      0,
      (fullPath, relative, stats) => {
        const fileName = relative[relative.length - 1];
        files.push({
          path: fullPath,
          relativePath: relative.join("/"),
          fileName,
          name: withoutExtension(fileName),
          folder,
          format: schematicFormatOf(fileName) ?? "structure",
          size: stats.size,
          modifiedAt: Math.round(stats.mtimeMs),
        });
      },
      budget,
    );
  }

  return files.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

export function safeSchematicSegments(relativePath: string): string[] | null {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  if (!schematicFormatOf(segments[segments.length - 1] ?? "")) return null;

  const inRoot = SCHEMATIC_ROOTS.some(
    ({ segments: prefix }) =>
      segments.length > prefix.length &&
      prefix.every(
        (part, index) => segments[index].toLowerCase() === part.toLowerCase(),
      ),
  );
  return inRoot ? segments : null;
}

async function freeTarget(directory: string, fileName: string): Promise<string> {
  const extension = path.extname(fileName);
  const base = withoutExtension(fileName);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = path.join(
      directory,
      attempt === 0 ? fileName : `${base} (${attempt + 1})${extension}`,
    );
    if (!(await fs.pathExists(candidate))) return candidate;
  }

  return path.join(directory, `${base}-${Date.now()}${extension}`);
}

export async function transferSchematic(
  sourceVersionPath: string,
  relativePath: string,
  targetVersionPath: string,
  mode: "copy" | "move",
): Promise<SchematicTransferResult> {
  const segments = safeSchematicSegments(relativePath);
  if (!segments) return { ok: false, error: "invalidPath" };

  const sourceRoot = path.resolve(sourceVersionPath);
  const targetRoot = path.resolve(targetVersionPath);
  if (sourceRoot.toLowerCase() === targetRoot.toLowerCase()) {
    return { ok: false, error: "sameInstance" };
  }

  const source = path.join(sourceRoot, ...segments);
  if (!(await fs.pathExists(source))) return { ok: false, error: "missing" };

  try {
    const directory = path.join(targetRoot, ...segments.slice(0, -1));
    await fs.ensureDir(directory);
    const target = await freeTarget(directory, segments[segments.length - 1]);

    if (mode === "move") await fs.move(source, target, { overwrite: false });
    else await fs.copy(source, target, { overwrite: false, errorOnExist: true });

    return {
      ok: true,
      path: target,
      relativePath: path.relative(targetRoot, target).split(path.sep).join("/"),
    };
  } catch (error) {
    console.error("[schematics] transfer failed:", error);
    return { ok: false, error: "failed" };
  }
}
