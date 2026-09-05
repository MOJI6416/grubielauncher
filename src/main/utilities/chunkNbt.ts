/**
 * Reads the parts of a chunk's NBT the chunk editor cares about.
 *
 * Two on-disk layouts exist: since 1.18 the fields sit at the root of the
 * compound (`Status`, `xPos`, `sections`…), before that they were wrapped in a
 * `Level` compound and used capitalised names (`Sections`, `TileEntities`).
 */
import { deserialize } from "@xmcl/nbt";
import {
  ChunkNbtFormat,
  IChunkBlockEntity,
  IChunkEntityGroup,
} from "@/types/WorldChunks";
import {
  NBT_TAG,
  NbtTagRef,
  findNbtChild,
  readNbtCompound,
  readNbtInt,
  readNbtListLength,
  readNbtLong,
  readNbtRoot,
  readNbtString,
  writeNbtLong,
} from "./nbtScan";

export interface ChunkNbtSummary {
  format: ChunkNbtFormat;
  status: string | null;
  inhabitedTime: number | null;
  /** Payload offset of the `InhabitedTime` long, for in-place patching. */
  inhabitedTimeOffset: number | null;
  lastUpdate: number | null;
  dataVersion: number | null;
  xPos: number | null;
  zPos: number | null;
  yPos: number | null;
  lightOn: boolean | null;
  sectionCount: number | null;
}

export function normalizeChunkStatus(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.startsWith("minecraft:")
    ? trimmed.slice("minecraft:".length)
    : trimmed;
}

function intField(
  buffer: Buffer,
  fields: NbtTagRef[],
  name: string,
): number | null {
  const tag = findNbtChild(fields, name, NBT_TAG.Int);
  return tag ? readNbtInt(buffer, tag.payloadStart) : null;
}

function longField(
  buffer: Buffer,
  fields: NbtTagRef[],
  name: string,
): number | null {
  const tag = findNbtChild(fields, name, NBT_TAG.Long);
  return tag ? readNbtLong(buffer, tag.payloadStart) : null;
}

function byteField(
  buffer: Buffer,
  fields: NbtTagRef[],
  name: string,
): number | null {
  const tag = findNbtChild(fields, name, NBT_TAG.Byte);
  return tag ? buffer.readInt8(tag.payloadStart) : null;
}

/** Scans the fields without building an object tree. Throws NbtScanError on garbage. */
export function scanChunkNbt(buffer: Buffer): ChunkNbtSummary {
  const root = readNbtRoot(buffer);
  const rootFields = readNbtCompound(buffer, root.payloadStart);
  const level = findNbtChild(rootFields, "Level", NBT_TAG.Compound);

  const fields = level
    ? readNbtCompound(buffer, level.payloadStart)
    : rootFields;
  const format: ChunkNbtFormat = level
    ? "level"
    : findNbtChild(rootFields, "Status") ||
        findNbtChild(rootFields, "sections") ||
        findNbtChild(rootFields, "xPos")
      ? "flat"
      : "unknown";

  const statusTag = findNbtChild(fields, "Status", NBT_TAG.String);
  const inhabitedTag = findNbtChild(fields, "InhabitedTime", NBT_TAG.Long);
  const sectionsTag =
    findNbtChild(fields, "sections", NBT_TAG.List) ??
    findNbtChild(fields, "Sections", NBT_TAG.List);
  const lightOn = byteField(buffer, fields, "isLightOn");

  return {
    format,
    status: statusTag
      ? normalizeChunkStatus(readNbtString(buffer, statusTag.payloadStart))
      : null,
    inhabitedTime: inhabitedTag
      ? readNbtLong(buffer, inhabitedTag.payloadStart)
      : null,
    inhabitedTimeOffset: inhabitedTag ? inhabitedTag.payloadStart : null,
    lastUpdate: longField(buffer, fields, "LastUpdate"),
    dataVersion: intField(buffer, rootFields, "DataVersion"),
    xPos: intField(buffer, fields, "xPos"),
    zPos: intField(buffer, fields, "zPos"),
    yPos: intField(buffer, fields, "yPos"),
    lightOn: lightOn === null ? null : lightOn !== 0,
    sectionCount: sectionsTag
      ? readNbtListLength(buffer, sectionsTag.payloadStart)
      : null,
  };
}

/** Returns a copy of the payload with `InhabitedTime` replaced. */
export function patchChunkInhabitedTime(
  buffer: Buffer,
  offset: number,
  ticks: number,
): Buffer {
  const copy = Buffer.from(buffer);
  writeNbtLong(copy, offset, ticks);
  return copy;
}

export interface ChunkNbtDetails {
  format: ChunkNbtFormat;
  nbtBytes: number;
  yMin: number | null;
  yMax: number | null;
  sectionCount: number;
  lightOn: boolean | null;
  heightmaps: string[];
  biomes: string[];
  structureStarts: string[];
  structureReferences: string[];
  blockEntities: IChunkBlockEntity[];
  /** Entities stored inside the chunk itself (before 1.17). */
  legacyEntities: IChunkEntityGroup[];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function paletteNames(palette: unknown): string[] {
  if (!Array.isArray(palette)) return [];

  return palette
    .map((entry) => (isRecord(entry) ? entry.Name : entry))
    .filter((entry): entry is string => typeof entry === "string");
}

function isEmptySection(section: Record<string, unknown>): boolean {
  const states = isRecord(section.block_states) ? section.block_states : null;
  const palette = paletteNames(states?.palette ?? section.Palette);

  if (palette.length > 0) {
    return palette.length === 1 && palette[0] === "minecraft:air";
  }

  return !section.Blocks && !section.BlockStates && !states;
}

export function groupEntities(list: unknown): IChunkEntityGroup[] {
  if (!Array.isArray(list)) return [];

  const counts = new Map<string, number>();
  for (const entity of list) {
    if (!isRecord(entity)) continue;
    const id = typeof entity.id === "string" ? entity.id : "?";
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function blockEntities(list: unknown): IChunkBlockEntity[] {
  if (!Array.isArray(list)) return [];

  const entries: IChunkBlockEntity[] = [];
  for (const entity of list) {
    if (!isRecord(entity)) continue;
    const x = toNumber(entity.x);
    const y = toNumber(entity.y);
    const z = toNumber(entity.z);
    if (x === null || y === null || z === null) continue;

    entries.push({
      id: typeof entity.id === "string" ? entity.id : "?",
      x,
      y,
      z,
    });
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id) || a.y - b.y);
}

export async function readChunkNbtDetails(
  buffer: Buffer,
): Promise<ChunkNbtDetails> {
  const nbt: unknown = await deserialize(new Uint8Array(buffer));
  const root = isRecord(nbt) ? nbt : {};
  const level = isRecord(root.Level) ? root.Level : null;
  const data = level ?? root;
  const format: ChunkNbtFormat = level
    ? "level"
    : "Status" in root || "sections" in root || "xPos" in root
      ? "flat"
      : "unknown";

  const sections = (
    Array.isArray(data.sections)
      ? data.sections
      : Array.isArray(data.Sections)
        ? data.Sections
        : []
  ).filter(isRecord);

  const ys = sections
    .filter((section) => !isEmptySection(section))
    .map((section) => toNumber(section.Y))
    .filter((y): y is number => y !== null);

  const biomes = new Set<string>();
  for (const section of sections) {
    const container = isRecord(section.biomes) ? section.biomes : null;
    for (const name of paletteNames(container?.palette)) biomes.add(name);
  }

  const structures = isRecord(data.structures)
    ? data.structures
    : isRecord(data.Structures)
      ? data.Structures
      : null;
  const starts = isRecord(structures?.starts)
    ? structures.starts
    : isRecord(structures?.Starts)
      ? structures.Starts
      : {};
  const references = isRecord(structures?.References)
    ? structures.References
    : isRecord(structures?.references)
      ? structures.references
      : {};

  const structureStarts = Object.entries(starts)
    .filter(([, start]) => isRecord(start) && start.id !== "INVALID")
    .map(([name]) => name)
    .sort();
  const structureReferences = Object.entries(references)
    .filter(([, refs]) => Array.isArray(refs) && refs.length > 0)
    .map(([name]) => name)
    .sort();

  const lightOn = toNumber(data.isLightOn);

  return {
    format,
    nbtBytes: buffer.length,
    yMin: ys.length ? Math.min(...ys) : null,
    yMax: ys.length ? Math.max(...ys) : null,
    sectionCount: ys.length,
    lightOn: lightOn === null ? null : lightOn !== 0,
    heightmaps: isRecord(data.Heightmaps)
      ? Object.keys(data.Heightmaps).sort()
      : [],
    biomes: [...biomes].sort(),
    structureStarts,
    structureReferences,
    blockEntities: blockEntities(data.block_entities ?? data.TileEntities),
    legacyEntities: groupEntities(data.Entities),
  };
}

/** Groups the entities of an `entities/r.X.Z.mca` chunk by id. */
export async function readEntityChunk(
  buffer: Buffer,
): Promise<IChunkEntityGroup[]> {
  const nbt: unknown = await deserialize(new Uint8Array(buffer));
  return isRecord(nbt) ? groupEntities(nbt.Entities) : [];
}

/** Counts the point-of-interest records of a `poi/r.X.Z.mca` chunk. */
export async function readPoiChunk(buffer: Buffer): Promise<number> {
  const nbt: unknown = await deserialize(new Uint8Array(buffer));
  const sections = isRecord(nbt) && isRecord(nbt.Sections) ? nbt.Sections : {};

  let count = 0;
  for (const section of Object.values(sections)) {
    if (isRecord(section) && Array.isArray(section.Records)) {
      count += section.Records.length;
    }
  }

  return count;
}
