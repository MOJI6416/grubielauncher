/**
 * World-level chunk operations for the chunk editor: listing dimensions and
 * regions, scanning chunk metadata, inspecting a single chunk, and rewriting
 * region files to delete chunks or reset their inhabited time.
 */
import fs from "fs-extra";
import path from "path";
import { WorldBackupCreateResult } from "@/types/WorldBackup";
import {
  ChunkEditResult,
  ChunkProblem,
  CHUNKS_PER_REGION_AXIS,
  END_ID,
  IChunkDetails,
  IChunkDimension,
  IChunkRegion,
  IChunkRegionScan,
  IChunkSummary,
  MAX_CHUNK_EDIT_COUNT,
  NETHER_ID,
  OVERWORLD_ID,
  isDimensionId,
} from "@/types/WorldChunks";
import {
  RawChunk,
  REGION_HEADER_BYTES,
  RegionHeaderEntry,
  compressChunk,
  compressionByte,
  decompressChunk,
  externalChunkFileName,
  hasRegionHeader,
  isDecodableCompression,
  parseRegionFileName,
  readRawChunk,
  readRegionHeader,
  regionFileName,
  rewriteRegionFile,
} from "./anvilRegion";
import {
  ChunkNbtSummary,
  patchChunkInhabitedTime,
  readChunkNbtDetails,
  readEntityChunk,
  readPoiChunk,
  scanChunkNbt,
} from "./chunkNbt";
import { NbtScanError } from "./nbtScan";

const KNOWN_DIMENSIONS: { id: string; folder: string }[] = [
  { id: OVERWORLD_ID, folder: "" },
  { id: NETHER_ID, folder: "DIM-1" },
  { id: END_ID, folder: "DIM1" },
];

const DATA_FOLDERS = ["region", "entities", "poi"] as const;
type DataFolder = (typeof DATA_FOLDERS)[number];

const CUSTOM_DIMENSIONS_FOLDER = "dimensions";
const MAX_CUSTOM_DIMENSION_DEPTH = 6;
const SCAN_BATCH = 32;

let editQueue: Promise<unknown> = Promise.resolve();

function enqueueEdit<T>(task: () => Promise<T>): Promise<T> {
  const run = editQueue.then(task, task);
  editQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function dimensionFolder(dimensionId: string): string | null {
  const known = KNOWN_DIMENSIONS.find((entry) => entry.id === dimensionId);
  if (known) return known.folder;
  if (!isDimensionId(dimensionId)) return null;

  const [namespace, name] = dimensionId.split(":");
  return path.join(CUSTOM_DIMENSIONS_FOLDER, namespace, ...name.split("/"));
}

function dimensionRoot(worldPath: string, dimensionId: string): string | null {
  const folder = dimensionFolder(dimensionId);
  if (folder === null) return null;
  return folder ? path.join(worldPath, folder) : worldPath;
}

function dataDir(root: string, kind: DataFolder): string {
  return path.join(root, kind);
}

interface RegionFile {
  x: number;
  z: number;
  path: string;
  size: number;
  mtimeMs: number;
}

async function listRegionFiles(directory: string): Promise<RegionFile[]> {
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const files: RegionFile[] = [];

  for (const name of names) {
    const parsed = parseRegionFileName(name);
    if (!parsed) continue;

    const filePath = path.join(directory, name);
    const stats = await fs.stat(filePath).catch(() => null);
    if (!stats?.isFile()) continue;

    files.push({
      ...parsed,
      path: filePath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    });
  }

  return files.sort((a, b) => a.z - b.z || a.x - b.x);
}

/** Reads just the 8 KiB header of a region file. */
async function readRegionHeaderOnly(filePath: string): Promise<Buffer | null> {
  let handle: fs.promises.FileHandle | null = null;

  try {
    handle = await fs.promises.open(filePath, "r");
    const buffer = Buffer.alloc(REGION_HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, REGION_HEADER_BYTES, 0);
    return bytesRead === REGION_HEADER_BYTES ? buffer : null;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function describeDimension(
  id: string,
  folder: string,
  root: string,
): Promise<IChunkDimension | null> {
  const regionDir = dataDir(root, "region");
  const entitiesDir = dataDir(root, "entities");
  const poiDir = dataDir(root, "poi");

  const [hasRegion, hasEntities, hasPoi] = await Promise.all([
    fs.pathExists(regionDir),
    fs.pathExists(entitiesDir),
    fs.pathExists(poiDir),
  ]);

  if (!hasRegion && !hasEntities && !hasPoi && id !== OVERWORLD_ID) {
    return null;
  }

  const regions = hasRegion ? await listRegionFiles(regionDir) : [];
  let chunkCount = 0;
  let sizeBytes = 0;

  for (const region of regions) {
    sizeBytes += region.size;
    const header = await readRegionHeaderOnly(region.path);
    if (header) chunkCount += readRegionHeader(header).length;
  }

  for (const [present, directory] of [
    [hasEntities, entitiesDir],
    [hasPoi, poiDir],
  ] as const) {
    if (!present) continue;
    for (const file of await listRegionFiles(directory)) sizeBytes += file.size;
  }

  return {
    id,
    folder,
    regionCount: regions.length,
    chunkCount,
    sizeBytes,
    hasEntities,
    hasPoi,
  };
}

async function findCustomDimensions(
  worldPath: string,
): Promise<{ id: string; folder: string }[]> {
  const base = path.join(worldPath, CUSTOM_DIMENSIONS_FOLDER);
  const namespaces = await fs.readdir(base).catch(() => [] as string[]);
  const found: { id: string; folder: string }[] = [];

  const walk = async (
    namespace: string,
    segments: string[],
    directory: string,
  ) => {
    if (segments.length > MAX_CUSTOM_DIMENSION_DEPTH) return;

    const entries = await fs
      .readdir(directory, { withFileTypes: true })
      .catch(() => []);
    const names = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    if (
      segments.length > 0 &&
      DATA_FOLDERS.some((kind) => names.includes(kind))
    ) {
      const id = `${namespace}:${segments.join("/")}`;
      if (isDimensionId(id)) {
        found.push({
          id,
          folder: path.join(CUSTOM_DIMENSIONS_FOLDER, namespace, ...segments),
        });
      }
      return;
    }

    for (const name of names) {
      if (DATA_FOLDERS.includes(name as DataFolder)) continue;
      await walk(namespace, [...segments, name], path.join(directory, name));
    }
  };

  for (const namespace of namespaces.sort()) {
    const directory = path.join(base, namespace);
    const stats = await fs.stat(directory).catch(() => null);
    if (!stats?.isDirectory()) continue;
    await walk(namespace, [], directory);
  }

  return found;
}

export async function isWorldFolder(worldPath: string): Promise<boolean> {
  return fs.pathExists(path.join(worldPath, "level.dat"));
}

export async function listChunkDimensions(
  worldPath: string,
): Promise<IChunkDimension[]> {
  const candidates = [
    ...KNOWN_DIMENSIONS,
    ...(await findCustomDimensions(worldPath)),
  ];
  const dimensions: IChunkDimension[] = [];

  for (const candidate of candidates) {
    const root = candidate.folder
      ? path.join(worldPath, candidate.folder)
      : worldPath;
    const described = await describeDimension(
      candidate.id,
      candidate.folder,
      root,
    );
    if (described) dimensions.push(described);
  }

  return dimensions;
}

export async function listChunkRegions(
  worldPath: string,
  dimensionId: string,
): Promise<IChunkRegion[]> {
  const root = dimensionRoot(worldPath, dimensionId);
  if (!root) return [];

  const regions: IChunkRegion[] = [];

  for (const file of await listRegionFiles(dataDir(root, "region"))) {
    const header = await readRegionHeaderOnly(file.path);
    regions.push({
      x: file.x,
      z: file.z,
      sizeBytes: file.size,
      modifiedAt: Math.round(file.mtimeMs),
      present: header
        ? readRegionHeader(header).map((entry) => entry.index)
        : [],
    });
  }

  return regions;
}

interface ChunkRead {
  raw: RawChunk | null;
  payload: Buffer | null;
  summary: ChunkNbtSummary | null;
  problem: ChunkProblem | null;
}

async function readChunk(
  file: Buffer,
  entry: RegionHeaderEntry,
  directory: string,
  regionX: number,
  regionZ: number,
): Promise<ChunkRead> {
  const raw = readRawChunk(file, entry);
  if (!raw.ok)
    return { raw: null, payload: null, summary: null, problem: "header" };

  const chunk = raw.chunk;
  if (!isDecodableCompression(chunk.compression)) {
    return { raw: chunk, payload: null, summary: null, problem: "unsupported" };
  }

  let compressed: Buffer | null = chunk.data;
  if (chunk.external) {
    const externalPath = path.join(
      directory,
      externalChunkFileName(
        regionX * CHUNKS_PER_REGION_AXIS + chunk.localX,
        regionZ * CHUNKS_PER_REGION_AXIS + chunk.localZ,
      ),
    );
    compressed = await fs.readFile(externalPath).catch(() => null);
    if (!compressed) {
      return { raw: chunk, payload: null, summary: null, problem: "header" };
    }
  }

  let payload: Buffer | null;
  try {
    payload = await decompressChunk(chunk.compression, compressed);
  } catch {
    payload = null;
  }
  if (!payload) {
    return { raw: chunk, payload: null, summary: null, problem: "compression" };
  }

  let summary: ChunkNbtSummary;
  try {
    summary = scanChunkNbt(payload);
  } catch (error) {
    if (error instanceof NbtScanError || error instanceof RangeError) {
      return { raw: chunk, payload, summary: null, problem: "nbt" };
    }
    throw error;
  }

  const absoluteX = regionX * CHUNKS_PER_REGION_AXIS + chunk.localX;
  const absoluteZ = regionZ * CHUNKS_PER_REGION_AXIS + chunk.localZ;
  const misplaced =
    (summary.xPos !== null && summary.xPos !== absoluteX) ||
    (summary.zPos !== null && summary.zPos !== absoluteZ);

  return {
    raw: chunk,
    payload,
    summary,
    problem: misplaced ? "position" : null,
  };
}

function toSummary(
  entry: RegionHeaderEntry,
  read: ChunkRead,
  regionX: number,
  regionZ: number,
  hasEntities: boolean,
  hasPoi: boolean,
): IChunkSummary {
  return {
    x: regionX * CHUNKS_PER_REGION_AXIS + (entry.index & 31),
    z: regionZ * CHUNKS_PER_REGION_AXIS + (entry.index >> 5),
    sectors: entry.sectors,
    timestamp: entry.timestamp,
    compression: read.raw?.compression ?? "unknown",
    external: read.raw?.external ?? false,
    status: read.summary?.status ?? null,
    inhabitedTime: read.summary?.inhabitedTime ?? null,
    lastUpdate: read.summary?.lastUpdate ?? null,
    dataVersion: read.summary?.dataVersion ?? null,
    problem: read.problem,
    hasEntities,
    hasPoi,
  };
}

async function presentSet(filePath: string): Promise<Set<number>> {
  const header = await readRegionHeaderOnly(filePath);
  return new Set(
    header ? readRegionHeader(header).map((entry) => entry.index) : [],
  );
}

export async function scanChunkRegion(
  worldPath: string,
  dimensionId: string,
  regionX: number,
  regionZ: number,
): Promise<IChunkRegionScan | null> {
  const root = dimensionRoot(worldPath, dimensionId);
  if (!root) return null;

  const name = regionFileName(regionX, regionZ);
  const regionDir = dataDir(root, "region");
  const file = await fs.readFile(path.join(regionDir, name)).catch(() => null);
  if (!file) return null;

  const [entities, poi] = await Promise.all([
    presentSet(path.join(dataDir(root, "entities"), name)),
    presentSet(path.join(dataDir(root, "poi"), name)),
  ]);

  const entries = hasRegionHeader(file) ? readRegionHeader(file) : [];
  const chunks: IChunkSummary[] = [];

  for (let start = 0; start < entries.length; start += SCAN_BATCH) {
    const batch = entries.slice(start, start + SCAN_BATCH);
    const reads = await Promise.all(
      batch.map((entry) => readChunk(file, entry, regionDir, regionX, regionZ)),
    );

    batch.forEach((entry, index) => {
      chunks.push(
        toSummary(
          entry,
          reads[index],
          regionX,
          regionZ,
          entities.has(entry.index),
          poi.has(entry.index),
        ),
      );
    });
  }

  return { x: regionX, z: regionZ, sizeBytes: file.length, chunks };
}

async function readSideChunk(
  directory: string,
  name: string,
  index: number,
  regionX: number,
  regionZ: number,
): Promise<Buffer | null> {
  const file = await fs.readFile(path.join(directory, name)).catch(() => null);
  if (!file || !hasRegionHeader(file)) return null;

  const entry = readRegionHeader(file).find((item) => item.index === index);
  if (!entry) return null;

  const read = await readChunk(file, entry, directory, regionX, regionZ);
  return read.payload;
}

export async function inspectChunk(
  worldPath: string,
  dimensionId: string,
  chunkX: number,
  chunkZ: number,
): Promise<IChunkDetails | null> {
  const root = dimensionRoot(worldPath, dimensionId);
  if (!root) return null;

  const regionX = chunkX >> 5;
  const regionZ = chunkZ >> 5;
  const index = ((chunkZ & 31) << 5) | (chunkX & 31);
  const name = regionFileName(regionX, regionZ);
  const regionDir = dataDir(root, "region");

  const file = await fs.readFile(path.join(regionDir, name)).catch(() => null);
  if (!file || !hasRegionHeader(file)) return null;

  const entry = readRegionHeader(file).find((item) => item.index === index);
  if (!entry) return null;

  const read = await readChunk(file, entry, regionDir, regionX, regionZ);
  const entitiesDir = dataDir(root, "entities");
  const poiDir = dataDir(root, "poi");

  const [entitiesPayload, poiPayload] = await Promise.all([
    readSideChunk(entitiesDir, name, index, regionX, regionZ),
    readSideChunk(poiDir, name, index, regionX, regionZ),
  ]);

  const base = toSummary(
    entry,
    read,
    regionX,
    regionZ,
    entitiesPayload !== null,
    poiPayload !== null,
  );

  const details: IChunkDetails = {
    ...base,
    format: read.summary?.format ?? "unknown",
    compressedBytes: read.raw?.storedBytes ?? 0,
    nbtBytes: read.payload?.length ?? null,
    yMin: null,
    yMax: null,
    sectionCount: read.summary?.sectionCount ?? null,
    lightOn: read.summary?.lightOn ?? null,
    heightmaps: [],
    biomes: [],
    structureStarts: [],
    structureReferences: [],
    blockEntities: [],
    entities: [],
    poiCount: null,
  };

  if (read.payload && read.summary) {
    try {
      const parsed = await readChunkNbtDetails(read.payload);
      details.yMin = parsed.yMin;
      details.yMax = parsed.yMax;
      details.sectionCount = parsed.sectionCount;
      details.lightOn = parsed.lightOn ?? details.lightOn;
      details.heightmaps = parsed.heightmaps;
      details.biomes = parsed.biomes;
      details.structureStarts = parsed.structureStarts;
      details.structureReferences = parsed.structureReferences;
      details.blockEntities = parsed.blockEntities;
      details.entities = parsed.legacyEntities;
    } catch (error) {
      console.warn("Failed to parse chunk details:", chunkX, chunkZ, error);
    }
  }

  if (entitiesPayload) {
    try {
      details.entities = await readEntityChunk(entitiesPayload);
    } catch (error) {
      console.warn("Failed to parse chunk entities:", chunkX, chunkZ, error);
    }
  }

  if (poiPayload) {
    try {
      details.poiCount = await readPoiChunk(poiPayload);
    } catch (error) {
      console.warn("Failed to parse chunk POI:", chunkX, chunkZ, error);
    }
  }

  return details;
}

export interface ChunkEditContext {
  /** Runs before any file is touched; a failure aborts the edit. */
  backup?: () => Promise<WorldBackupCreateResult>;
  /** Timestamp for rewritten chunks, in seconds. */
  now?: number;
}

type RegionSelection = Map<
  string,
  { x: number; z: number; indices: Set<number> }
>;

function groupByRegion(coords: number[]): RegionSelection {
  const groups: RegionSelection = new Map();

  for (let cursor = 0; cursor + 1 < coords.length; cursor += 2) {
    const chunkX = coords[cursor];
    const chunkZ = coords[cursor + 1];
    const regionX = chunkX >> 5;
    const regionZ = chunkZ >> 5;
    const key = `${regionX},${regionZ}`;

    let group = groups.get(key);
    if (!group) {
      group = { x: regionX, z: regionZ, indices: new Set() };
      groups.set(key, group);
    }

    group.indices.add(((chunkZ & 31) << 5) | (chunkX & 31));
  }

  return groups;
}

function selectionSize(groups: RegionSelection): number {
  let total = 0;
  for (const group of groups.values()) total += group.indices.size;
  return total;
}

async function prepareEdit(
  worldPath: string,
  dimensionId: string,
  coords: number[],
  context: ChunkEditContext,
): Promise<
  | { ok: true; root: string; groups: RegionSelection; backupId: string | null }
  | Extract<ChunkEditResult, { ok: false }>
> {
  if (coords.length === 0 || coords.length % 2 !== 0) {
    return { ok: false, error: "nothingSelected" };
  }
  if (coords.length / 2 > MAX_CHUNK_EDIT_COUNT) {
    return { ok: false, error: "tooManyChunks" };
  }
  if (!(await isWorldFolder(worldPath))) {
    return { ok: false, error: "worldMissing" };
  }

  const root = dimensionRoot(worldPath, dimensionId);
  if (!root || !(await fs.pathExists(root))) {
    return { ok: false, error: "dimensionMissing" };
  }

  const groups = groupByRegion(coords);
  if (selectionSize(groups) === 0) {
    return { ok: false, error: "nothingSelected" };
  }

  let backupId: string | null = null;
  if (context.backup) {
    const backup = await context.backup();
    if (!backup.ok) {
      return { ok: false, error: "backupFailed", backupError: backup.error };
    }
    backupId = backup.backup.id;
  }

  return { ok: true, root, groups, backupId };
}

export function deleteChunks(
  worldPath: string,
  dimensionId: string,
  coords: number[],
  context: ChunkEditContext = {},
): Promise<ChunkEditResult> {
  return enqueueEdit(async () => {
    const prepared = await prepareEdit(worldPath, dimensionId, coords, context);
    if (!prepared.ok) return prepared;

    const { root, groups, backupId } = prepared;
    let affected = 0;
    let regions = 0;
    let removedFiles = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;

    for (const group of groups.values()) {
      const name = regionFileName(group.x, group.z);
      let removedInRegion = 0;
      let touched = false;

      for (const kind of DATA_FOLDERS) {
        const filePath = path.join(dataDir(root, kind), name);
        if (!(await fs.pathExists(filePath))) continue;

        const result = await rewriteRegionFile(filePath, group.x, group.z, {
          remove: (index) => group.indices.has(index),
          now: context.now,
        });

        bytesBefore += result.bytesBefore;
        bytesAfter += result.bytesAfter;
        removedInRegion = Math.max(removedInRegion, result.removed);
        if (result.written) touched = true;
        if (result.deleted) removedFiles += 1;
      }

      affected += removedInRegion;
      if (touched) regions += 1;
    }

    return {
      ok: true,
      affected,
      skipped: selectionSize(groups) - affected,
      regions,
      removedFiles,
      bytesBefore,
      bytesAfter,
      backupId,
    };
  });
}

export function resetChunkInhabitedTime(
  worldPath: string,
  dimensionId: string,
  coords: number[],
  context: ChunkEditContext = {},
): Promise<ChunkEditResult> {
  return enqueueEdit(async () => {
    const prepared = await prepareEdit(worldPath, dimensionId, coords, context);
    if (!prepared.ok) return prepared;

    const { root, groups, backupId } = prepared;
    let affected = 0;
    let regions = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;

    for (const group of groups.values()) {
      const filePath = path.join(
        dataDir(root, "region"),
        regionFileName(group.x, group.z),
      );
      if (!(await fs.pathExists(filePath))) continue;

      const result = await rewriteRegionFile(filePath, group.x, group.z, {
        now: context.now,
        transform: async (chunk, compressed) => {
          if (!group.indices.has(chunk.index)) return undefined;
          if (!isDecodableCompression(chunk.compression)) return null;

          let payload: Buffer | null;
          try {
            payload = await decompressChunk(chunk.compression, compressed);
          } catch {
            return null;
          }
          if (!payload) return null;

          let summary: ChunkNbtSummary;
          try {
            summary = scanChunkNbt(payload);
          } catch {
            return null;
          }
          if (summary.inhabitedTimeOffset === null) return null;
          if (summary.inhabitedTime === 0) return null;

          const patched = patchChunkInhabitedTime(
            payload,
            summary.inhabitedTimeOffset,
            0,
          );

          return {
            compressionByte: compressionByte(chunk.compression),
            data: await compressChunk(chunk.compression, patched),
          };
        },
      });

      bytesBefore += result.bytesBefore;
      bytesAfter += result.bytesAfter;
      affected += result.transformed;
      if (result.written) regions += 1;
    }

    return {
      ok: true,
      affected,
      skipped: selectionSize(groups) - affected,
      regions,
      removedFiles: 0,
      bytesBefore,
      bytesAfter,
      backupId,
    };
  });
}
