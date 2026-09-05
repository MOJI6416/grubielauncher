/**
 * Renders the satellite image of a region file and keeps the result as a PNG
 * in the launcher cache, keyed by the region file's size and modification
 * time so edits invalidate it on their own.
 *
 * Rendering runs on the main process but yields between chunks, so IPC stays
 * responsive while a large region is being drawn.
 */
import fs from "fs-extra";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { PNG } from "pngjs";
import { getLauncherPaths } from "./other";
import {
  decompressChunk,
  externalChunkFileName,
  hasRegionHeader,
  isDecodableCompression,
  readRawChunk,
  readRegionHeader,
  regionFileName,
} from "./anvilRegion";
import {
  REGION_PIXELS,
  RegionColumns,
  composeRegionSurface,
  renderChunkColumnsFromNbt,
} from "./chunkSurface";
import { dimensionFolder } from "./worldChunks";
import { CHUNKS_PER_REGION_AXIS } from "@/types/WorldChunks";

const CACHE_FOLDER = "chunk-surface";
const MAX_PARALLEL_RENDERS = 2;
/** Chunks rendered between two turns of the event loop. */
const YIELD_EVERY = 4;

let active = 0;
const waiters: (() => void)[] = [];

async function acquire(): Promise<() => void> {
  if (active >= MAX_PARALLEL_RENDERS) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active += 1;

  return () => {
    active -= 1;
    waiters.shift()?.();
  };
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function surfaceCacheDir(
  worldPath: string,
  dimensionId: string,
): string {
  const key = createHash("sha1")
    .update(path.resolve(worldPath))
    .update("\0")
    .update(dimensionId)
    .digest("hex")
    .slice(0, 20);

  return path.join(getLauncherPaths().cache, CACHE_FOLDER, key);
}

function cacheFileName(
  regionX: number,
  regionZ: number,
  size: number,
  mtimeMs: number,
): string {
  return `r.${regionX}.${regionZ}.${size}-${Math.round(mtimeMs)}.png`;
}

function isCacheFileFor(
  name: string,
  regionX: number,
  regionZ: number,
): boolean {
  return name.startsWith(`r.${regionX}.${regionZ}.`) && name.endsWith(".png");
}

export function encodePng(
  rgba: Uint8ClampedArray,
  size: number,
): Promise<Buffer> {
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);

  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    png
      .pack()
      .on("data", (part: Buffer) => parts.push(part))
      .on("end", () => resolve(Buffer.concat(parts)))
      .on("error", reject);
  });
}

async function writeAtomically(target: string, data: Buffer): Promise<void> {
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.remove(tmp).catch(() => {});
    throw error;
  }
}

/** Renders one region file into a 512×512 RGBA buffer. */
export async function renderRegionFile(
  filePath: string,
  regionX: number,
  regionZ: number,
): Promise<Uint8ClampedArray | null> {
  const file = await fs.readFile(filePath).catch(() => null);
  if (!file || !hasRegionHeader(file)) return null;

  const directory = path.dirname(filePath);
  const columns: RegionColumns = new Map();
  let processed = 0;

  for (const entry of readRegionHeader(file)) {
    const raw = readRawChunk(file, entry);
    if (!raw.ok) continue;

    const chunk = raw.chunk;
    if (!isDecodableCompression(chunk.compression)) {
      columns.set(entry.index, null);
      continue;
    }

    let compressed: Buffer | null = chunk.data;
    if (chunk.external) {
      compressed = await fs
        .readFile(
          path.join(
            directory,
            externalChunkFileName(
              regionX * CHUNKS_PER_REGION_AXIS + chunk.localX,
              regionZ * CHUNKS_PER_REGION_AXIS + chunk.localZ,
            ),
          ),
        )
        .catch(() => null);
      if (!compressed) continue;
    }

    try {
      const payload = await decompressChunk(chunk.compression, compressed);
      if (!payload) continue;
      columns.set(entry.index, await renderChunkColumnsFromNbt(payload));
    } catch {
      continue;
    }

    processed += 1;
    if (processed % YIELD_EVERY === 0) await yieldToLoop();
  }

  return composeRegionSurface(columns);
}

/**
 * Returns the PNG of a region's satellite image, from the cache when the
 * region file has not changed since it was drawn.
 */
export async function renderRegionSurface(
  worldPath: string,
  dimensionId: string,
  regionX: number,
  regionZ: number,
): Promise<Uint8Array | null> {
  const folder = dimensionFolder(dimensionId);
  if (folder === null) return null;

  const root = folder ? path.join(worldPath, folder) : worldPath;
  const filePath = path.join(root, "region", regionFileName(regionX, regionZ));
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats?.isFile()) return null;

  const cacheDir = surfaceCacheDir(worldPath, dimensionId);
  const cacheName = cacheFileName(regionX, regionZ, stats.size, stats.mtimeMs);
  const cachePath = path.join(cacheDir, cacheName);

  const cached = await fs.readFile(cachePath).catch(() => null);
  if (cached) return new Uint8Array(cached);

  const release = await acquire();
  try {
    const rgba = await renderRegionFile(filePath, regionX, regionZ);
    if (!rgba) return null;

    const png = await encodePng(rgba, REGION_PIXELS);

    try {
      await fs.ensureDir(cacheDir);
      for (const name of await fs.readdir(cacheDir)) {
        if (name !== cacheName && isCacheFileFor(name, regionX, regionZ)) {
          await fs.remove(path.join(cacheDir, name)).catch(() => {});
        }
      }
      await writeAtomically(cachePath, png);
    } catch (error) {
      console.warn("Failed to cache the region surface:", cachePath, error);
    }

    return new Uint8Array(png);
  } finally {
    release();
  }
}

/** Drops cached images of a world, e.g. when the world is deleted. */
export async function clearSurfaceCache(
  worldPath: string,
  dimensionId: string,
): Promise<void> {
  await fs.remove(surfaceCacheDir(worldPath, dimensionId)).catch(() => {});
}
