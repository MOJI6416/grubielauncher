/**
 * The Anvil region file format (`r.X.Z.mca`).
 *
 * A region holds up to 32×32 chunks. The file starts with two 4 KiB tables —
 * chunk locations and chunk timestamps — followed by the chunk payloads, each
 * padded to whole 4 KiB sectors. Every payload is a 4-byte length, a
 * compression byte and the compressed NBT. Chunks above 1 MiB live next to the
 * region in `c.X.Z.mcc` and are marked by the 0x80 bit of the compression byte.
 */
import fs from "fs-extra";
import path from "path";
import zlib from "zlib";
import { promisify } from "util";
import { randomUUID } from "crypto";
import {
  ChunkCompression,
  CHUNKS_PER_REGION,
  CHUNKS_PER_REGION_AXIS,
  REGION_SECTOR_BYTES,
} from "@/types/WorldChunks";

const gunzipAsync = promisify(zlib.gunzip);
const inflateAsync = promisify(zlib.inflate);
const gzipAsync = promisify(zlib.gzip);
const deflateAsync = promisify(zlib.deflate);

export const REGION_HEADER_BYTES = 2 * REGION_SECTOR_BYTES;
export const MAX_CHUNK_SECTORS = 255;
export const EXTERNAL_CHUNK_FLAG = 0x80;

const REGION_NAME = /^r\.(-?\d+)\.(-?\d+)\.mca$/;
const EMPTY = Buffer.alloc(0);

export function regionFileName(x: number, z: number): string {
  return `r.${x}.${z}.mca`;
}

export function parseRegionFileName(
  name: string,
): { x: number; z: number } | null {
  const match = REGION_NAME.exec(name);
  if (!match) return null;

  const x = Number(match[1]);
  const z = Number(match[2]);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) return null;

  return { x, z };
}

export function externalChunkFileName(chunkX: number, chunkZ: number): string {
  return `c.${chunkX}.${chunkZ}.mcc`;
}

export interface RegionHeaderEntry {
  index: number;
  /** Offset of the payload in 4 KiB sectors from the start of the file. */
  offset: number;
  /** Sectors reserved for the payload. */
  sectors: number;
  /** Seconds since the epoch. */
  timestamp: number;
}

export function hasRegionHeader(buffer: Buffer): boolean {
  return buffer.length >= REGION_HEADER_BYTES;
}

/** Lists the header entries that point at chunk data. */
export function readRegionHeader(buffer: Buffer): RegionHeaderEntry[] {
  if (!hasRegionHeader(buffer)) return [];

  const entries: RegionHeaderEntry[] = [];

  for (let index = 0; index < CHUNKS_PER_REGION; index += 1) {
    const location = buffer.readUInt32BE(index * 4);
    const offset = location >>> 8;
    const sectors = location & 0xff;
    if (offset === 0 || sectors === 0) continue;

    entries.push({
      index,
      offset,
      sectors,
      timestamp: buffer.readUInt32BE(REGION_SECTOR_BYTES + index * 4),
    });
  }

  return entries;
}

export function compressionKind(byte: number): ChunkCompression {
  switch (byte & ~EXTERNAL_CHUNK_FLAG) {
    case 1:
      return "gzip";
    case 2:
      return "zlib";
    case 3:
      return "none";
    case 4:
      return "lz4";
    case 127:
      return "custom";
    default:
      return "unknown";
  }
}

export function compressionByte(kind: ChunkCompression): number {
  switch (kind) {
    case "gzip":
      return 1;
    case "zlib":
      return 2;
    case "none":
      return 3;
    case "lz4":
      return 4;
    case "custom":
      return 127;
    default:
      return 0;
  }
}

export function isDecodableCompression(kind: ChunkCompression): boolean {
  return kind === "gzip" || kind === "zlib" || kind === "none";
}

export interface RawChunk {
  index: number;
  localX: number;
  localZ: number;
  offset: number;
  sectors: number;
  timestamp: number;
  /** The compression byte as stored, external flag included. */
  compressionByte: number;
  compression: ChunkCompression;
  external: boolean;
  /** The compressed payload without the compression byte; empty for external chunks. */
  data: Buffer;
  /** Bytes the payload really uses inside its sectors. */
  storedBytes: number;
}

export type RawChunkRead =
  | { ok: true; chunk: RawChunk }
  | { ok: false; entry: RegionHeaderEntry; problem: "header" };

export function readRawChunk(
  file: Buffer,
  entry: RegionHeaderEntry,
): RawChunkRead {
  const start = entry.offset * REGION_SECTOR_BYTES;
  const failure: RawChunkRead = { ok: false, entry, problem: "header" };

  if (start < REGION_HEADER_BYTES || start + 5 > file.length) return failure;

  const length = file.readUInt32BE(start);
  if (length < 1 || start + 4 + length > file.length) return failure;
  if (4 + length > entry.sectors * REGION_SECTOR_BYTES) return failure;

  const byte = file.readUInt8(start + 4);
  const external = (byte & EXTERNAL_CHUNK_FLAG) !== 0;

  return {
    ok: true,
    chunk: {
      index: entry.index,
      localX: entry.index & 31,
      localZ: entry.index >> 5,
      offset: entry.offset,
      sectors: entry.sectors,
      timestamp: entry.timestamp,
      compressionByte: byte,
      compression: compressionKind(byte),
      external,
      data: external ? EMPTY : file.subarray(start + 5, start + 4 + length),
      storedBytes: 4 + length,
    },
  };
}

export async function decompressChunk(
  kind: ChunkCompression,
  data: Buffer,
): Promise<Buffer | null> {
  const input = new Uint8Array(data);

  switch (kind) {
    case "gzip":
      return Buffer.from(await gunzipAsync(input));
    case "zlib":
      return Buffer.from(await inflateAsync(input));
    case "none":
      return Buffer.from(input);
    default:
      return null;
  }
}

export async function compressChunk(
  kind: ChunkCompression,
  data: Buffer,
): Promise<Buffer> {
  const input = new Uint8Array(data);

  switch (kind) {
    case "gzip":
      return Buffer.from(await gzipAsync(input));
    case "zlib":
      return Buffer.from(await deflateAsync(input));
    case "none":
      return Buffer.from(input);
    default:
      throw new Error(`Cannot write chunks compressed with ${kind}`);
  }
}

export interface RegionWriteItem {
  index: number;
  timestamp: number;
  compressionByte: number;
  /** Compressed payload without the compression byte. */
  data: Buffer;
}

export interface RegionBuild {
  file: Buffer;
  /** Payloads that no longer fit inline and must be written as `c.X.Z.mcc`. */
  externals: { index: number; data: Buffer }[];
}

/** Lays chunks out back to back, returning the bytes of a compact region file. */
export function buildRegionFile(items: RegionWriteItem[]): RegionBuild {
  const header = Buffer.alloc(REGION_HEADER_BYTES);
  const blocks: Buffer[] = [];
  const externals: RegionBuild["externals"] = [];
  let sector = REGION_HEADER_BYTES / REGION_SECTOR_BYTES;

  for (const item of items) {
    if (item.index < 0 || item.index >= CHUNKS_PER_REGION) {
      throw new RangeError(`Chunk index ${item.index} is outside the region`);
    }

    let byte = item.compressionByte;
    let data = item.data;

    const inline = (byte & EXTERNAL_CHUNK_FLAG) === 0;
    if (inline && 5 + data.length > MAX_CHUNK_SECTORS * REGION_SECTOR_BYTES) {
      externals.push({ index: item.index, data });
      byte |= EXTERNAL_CHUNK_FLAG;
      data = EMPTY;
    }

    const length = 1 + data.length;
    const sectors = Math.ceil((4 + length) / REGION_SECTOR_BYTES);
    const block = Buffer.alloc(sectors * REGION_SECTOR_BYTES);
    block.writeUInt32BE(length, 0);
    block.writeUInt8(byte, 4);
    data.copy(block, 5);

    header.writeUInt32BE(((sector << 8) | sectors) >>> 0, item.index * 4);
    header.writeUInt32BE(
      item.timestamp >>> 0,
      REGION_SECTOR_BYTES + item.index * 4,
    );

    blocks.push(block);
    sector += sectors;
  }

  return { file: Buffer.concat([header, ...blocks]), externals };
}

export interface ChunkTransformResult {
  compressionByte: number;
  data: Buffer;
}

export interface RewriteRegionOptions {
  /** Chunks to drop from the file. */
  remove?: (index: number) => boolean;
  /**
   * Rewrites a chunk payload. Return `undefined` to keep the chunk as it is and
   * `null` to record it as skipped (kept, but the caller could not handle it).
   */
  transform?: (
    chunk: RawChunk,
    payload: Buffer,
  ) => Promise<ChunkTransformResult | null | undefined>;
  /** Timestamp for rewritten chunks, in seconds. */
  now?: number;
}

export interface RewriteRegionResult {
  kept: number;
  removed: number;
  transformed: number;
  skipped: number;
  /** Header entries that pointed at garbage and were dropped by the rewrite. */
  dropped: number;
  bytesBefore: number;
  bytesAfter: number;
  written: boolean;
  deleted: boolean;
  unreadable: boolean;
}

async function writeAtomically(filePath: string, data: Buffer): Promise<void> {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.remove(tmpPath).catch(() => {});
    throw error;
  }
}

/**
 * Rewrites a region file without the removed chunks, applying `transform` to
 * the rest. The new file is compact: freed sectors are not carried over. Files
 * that end up empty are deleted together with their external chunk files.
 */
export async function rewriteRegionFile(
  filePath: string,
  regionX: number,
  regionZ: number,
  options: RewriteRegionOptions,
): Promise<RewriteRegionResult> {
  const result: RewriteRegionResult = {
    kept: 0,
    removed: 0,
    transformed: 0,
    skipped: 0,
    dropped: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    written: false,
    deleted: false,
    unreadable: false,
  };

  const file = await fs.readFile(filePath);
  result.bytesBefore = file.length;
  result.bytesAfter = file.length;

  if (!hasRegionHeader(file)) {
    result.unreadable = true;
    return result;
  }

  const directory = path.dirname(filePath);
  const externalPath = (index: number) =>
    path.join(
      directory,
      externalChunkFileName(
        regionX * CHUNKS_PER_REGION_AXIS + (index & 31),
        regionZ * CHUNKS_PER_REGION_AXIS + (index >> 5),
      ),
    );

  const items: RegionWriteItem[] = [];
  const staleExternals: string[] = [];
  const now = options.now ?? Math.floor(Date.now() / 1000);

  for (const entry of readRegionHeader(file)) {
    const raw = readRawChunk(file, entry);

    if (options.remove?.(entry.index)) {
      result.removed += 1;
      if (raw.ok && raw.chunk.external) {
        staleExternals.push(externalPath(entry.index));
      }
      continue;
    }

    if (!raw.ok) {
      result.dropped += 1;
      continue;
    }

    const chunk = raw.chunk;

    if (options.transform) {
      let payload: Buffer | null = chunk.data;
      if (chunk.external) {
        payload = await fs
          .readFile(externalPath(entry.index))
          .catch(() => null);
      }

      const next =
        payload === null ? null : await options.transform(chunk, payload);

      if (next === null) {
        result.skipped += 1;
      } else if (next) {
        result.transformed += 1;
        if (chunk.external) staleExternals.push(externalPath(entry.index));
        items.push({
          index: entry.index,
          timestamp: now,
          compressionByte: next.compressionByte & ~EXTERNAL_CHUNK_FLAG,
          data: next.data,
        });
        continue;
      }
    }

    result.kept += 1;
    items.push({
      index: entry.index,
      timestamp: entry.timestamp,
      compressionByte: chunk.compressionByte,
      data: chunk.data,
    });
  }

  if (result.removed === 0 && result.transformed === 0) return result;

  if (items.length === 0) {
    await fs.remove(filePath);
    result.deleted = true;
    result.written = true;
    result.bytesAfter = 0;
  } else {
    const build = buildRegionFile(items);

    for (const external of build.externals) {
      const target = externalPath(external.index);
      await writeAtomically(target, external.data);
      const staleIndex = staleExternals.indexOf(target);
      if (staleIndex !== -1) staleExternals.splice(staleIndex, 1);
    }

    await writeAtomically(filePath, build.file);
    result.written = true;
    result.bytesAfter = build.file.length;
  }

  for (const stale of staleExternals) {
    await fs.remove(stale).catch(() => {});
  }

  return result;
}
