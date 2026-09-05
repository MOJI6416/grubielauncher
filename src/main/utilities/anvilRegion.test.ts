import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import {
  EXTERNAL_CHUNK_FLAG,
  MAX_CHUNK_SECTORS,
  REGION_HEADER_BYTES,
  buildRegionFile,
  compressionKind,
  externalChunkFileName,
  parseRegionFileName,
  readRawChunk,
  readRegionHeader,
  regionFileName,
  rewriteRegionFile,
} from "./anvilRegion";
import { REGION_SECTOR_BYTES } from "@/types/WorldChunks";
import {
  flatChunkNbt,
  localIndex,
  regionFile,
} from "./chunkFixtures.test-helpers";

describe("region file names", () => {
  it("parses coordinates, negatives included", () => {
    expect(parseRegionFileName("r.0.0.mca")).toEqual({ x: 0, z: 0 });
    expect(parseRegionFileName("r.-3.12.mca")).toEqual({ x: -3, z: 12 });
    expect(parseRegionFileName("r.1.2.mcc")).toBeNull();
    expect(parseRegionFileName("region.mca")).toBeNull();
    expect(regionFileName(-1, 5)).toBe("r.-1.5.mca");
    expect(externalChunkFileName(-40, 3)).toBe("c.-40.3.mcc");
  });

  it("maps compression bytes, ignoring the external flag", () => {
    expect(compressionKind(1)).toBe("gzip");
    expect(compressionKind(2)).toBe("zlib");
    expect(compressionKind(3)).toBe("none");
    expect(compressionKind(4)).toBe("lz4");
    expect(compressionKind(127)).toBe("custom");
    expect(compressionKind(2 | EXTERNAL_CHUNK_FLAG)).toBe("zlib");
    expect(compressionKind(9)).toBe("unknown");
  });
});

describe("buildRegionFile", () => {
  it("packs chunks into 4 KiB sectors and fills the header", () => {
    const file = regionFile([
      { index: localIndex(0, 0), nbt: flatChunkNbt({ x: 0, z: 0 }) },
      {
        index: localIndex(5, 2),
        nbt: flatChunkNbt({ x: 5, z: 2 }),
        timestamp: 123,
      },
    ]);

    expect(file.length % REGION_SECTOR_BYTES).toBe(0);
    expect(file.length).toBeGreaterThan(REGION_HEADER_BYTES);

    const entries = readRegionHeader(file);
    expect(entries.map((entry) => entry.index)).toEqual([
      localIndex(0, 0),
      localIndex(5, 2),
    ]);
    expect(entries[0].offset).toBe(2);
    expect(entries[1].offset).toBe(2 + entries[0].sectors);
    expect(entries[1].timestamp).toBe(123);
  });

  it("moves payloads above 1 MiB into external files", () => {
    const huge = Buffer.alloc(MAX_CHUNK_SECTORS * REGION_SECTOR_BYTES, 7);
    const build = buildRegionFile([
      { index: 3, timestamp: 1, compressionByte: 2, data: huge },
    ]);

    expect(build.externals).toHaveLength(1);
    expect(build.externals[0].index).toBe(3);

    const entries = readRegionHeader(build.file);
    expect(entries).toHaveLength(1);
    expect(entries[0].sectors).toBe(1);

    const raw = readRawChunk(build.file, entries[0]);
    expect(raw.ok && raw.chunk.external).toBe(true);
    expect(raw.ok && raw.chunk.compression).toBe("zlib");
  });

  it("refuses indices outside the region", () => {
    expect(() =>
      buildRegionFile([
        {
          index: 1024,
          timestamp: 0,
          compressionByte: 2,
          data: Buffer.alloc(1),
        },
      ]),
    ).toThrow(RangeError);
  });
});

describe("readRawChunk", () => {
  it("reads back the compressed payload", () => {
    const nbt = flatChunkNbt({ x: 1, z: 1 });
    const file = regionFile([
      { index: localIndex(1, 1), nbt, compression: "gzip" },
    ]);
    const [entry] = readRegionHeader(file);
    const raw = readRawChunk(file, entry);

    expect(raw.ok).toBe(true);
    if (!raw.ok) return;

    expect(raw.chunk.compression).toBe("gzip");
    expect(raw.chunk.localX).toBe(1);
    expect(raw.chunk.localZ).toBe(1);
    expect(raw.chunk.data.length).toBeGreaterThan(0);
    expect(raw.chunk.storedBytes).toBe(4 + 1 + raw.chunk.data.length);
  });

  it("flags header entries pointing past the file or at oversized payloads", () => {
    const file = regionFile([{ index: 0, nbt: flatChunkNbt({ x: 0, z: 0 }) }]);

    expect(
      readRawChunk(file, { index: 0, offset: 99, sectors: 1, timestamp: 0 }),
    ).toEqual({
      ok: false,
      entry: { index: 0, offset: 99, sectors: 1, timestamp: 0 },
      problem: "header",
    });

    const [entry] = readRegionHeader(file);
    const truncated = Buffer.from(file);
    truncated.writeUInt32BE(
      REGION_SECTOR_BYTES * 3,
      entry.offset * REGION_SECTOR_BYTES,
    );
    expect(readRawChunk(truncated, entry).ok).toBe(false);

    const inHeader = readRawChunk(file, {
      index: 0,
      offset: 1,
      sectors: 1,
      timestamp: 0,
    });
    expect(inHeader.ok).toBe(false);
  });

  it("returns no entries for a file without a complete header", () => {
    expect(readRegionHeader(Buffer.alloc(100))).toEqual([]);
  });
});

describe("rewriteRegionFile", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-anvil-"));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  async function writeRegion(name: string, file: Buffer): Promise<string> {
    const target = path.join(root, name);
    await fs.writeFile(target, file);
    return target;
  }

  it("drops removed chunks and compacts the rest", async () => {
    const keepA = localIndex(0, 0);
    const drop = localIndex(1, 0);
    const keepB = localIndex(2, 0);
    const original = regionFile([
      { index: keepA, nbt: flatChunkNbt({ x: 0, z: 0 }), timestamp: 10 },
      { index: drop, nbt: flatChunkNbt({ x: 1, z: 0 }), timestamp: 20 },
      { index: keepB, nbt: flatChunkNbt({ x: 2, z: 0 }), timestamp: 30 },
    ]);
    const target = await writeRegion("r.0.0.mca", original);

    const result = await rewriteRegionFile(target, 0, 0, {
      remove: (index) => index === drop,
    });

    expect(result).toMatchObject({
      kept: 2,
      removed: 1,
      transformed: 0,
      dropped: 0,
      written: true,
      deleted: false,
      bytesBefore: original.length,
    });
    expect(result.bytesAfter).toBeLessThan(original.length);

    const rewritten = await fs.readFile(target);
    const entries = readRegionHeader(rewritten);
    expect(entries.map((entry) => entry.index)).toEqual([keepA, keepB]);
    expect(entries.map((entry) => entry.timestamp)).toEqual([10, 30]);
    expect(entries[0].offset).toBe(2);
    expect(entries[1].offset).toBe(2 + entries[0].sectors);
    expect(rewritten.length).toBe(result.bytesAfter);
    expect(
      (await fs.readdir(root)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("does not touch the file when nothing changes", async () => {
    const original = regionFile([
      { index: 0, nbt: flatChunkNbt({ x: 0, z: 0 }) },
    ]);
    const target = await writeRegion("r.0.0.mca", original);
    const before = await fs.stat(target);

    const result = await rewriteRegionFile(target, 0, 0, {
      remove: () => false,
    });

    expect(result.written).toBe(false);
    expect(result.bytesAfter).toBe(original.length);
    expect((await fs.stat(target)).mtimeMs).toBe(before.mtimeMs);
  });

  it("deletes the file and stale external chunks when every chunk goes", async () => {
    const external = Buffer.alloc(MAX_CHUNK_SECTORS * REGION_SECTOR_BYTES, 1);
    const build = buildRegionFile([
      {
        index: localIndex(4, 4),
        timestamp: 1,
        compressionByte: 2,
        data: external,
      },
      {
        index: localIndex(5, 4),
        timestamp: 1,
        compressionByte: 2,
        data: Buffer.alloc(10),
      },
    ]);
    const target = await writeRegion("r.-1.2.mca", build.file);
    const externalPath = path.join(
      root,
      externalChunkFileName(-32 + 4, 64 + 4),
    );
    await fs.writeFile(externalPath, external);

    const result = await rewriteRegionFile(target, -1, 2, {
      remove: () => true,
    });

    expect(result).toMatchObject({
      removed: 2,
      deleted: true,
      written: true,
      bytesAfter: 0,
    });
    expect(await fs.pathExists(target)).toBe(false);
    expect(await fs.pathExists(externalPath)).toBe(false);
  });

  it("rewrites transformed chunks with a fresh timestamp and keeps skipped ones", async () => {
    const a = localIndex(0, 0);
    const b = localIndex(1, 0);
    const original = regionFile([
      { index: a, nbt: flatChunkNbt({ x: 0, z: 0 }), timestamp: 5 },
      { index: b, nbt: flatChunkNbt({ x: 1, z: 0 }), timestamp: 6 },
    ]);
    const target = await writeRegion("r.0.0.mca", original);
    const replacement = Buffer.from("replaced");

    const result = await rewriteRegionFile(target, 0, 0, {
      now: 777,
      transform: async (chunk) =>
        chunk.index === a ? { compressionByte: 3, data: replacement } : null,
    });

    expect(result).toMatchObject({
      kept: 1,
      transformed: 1,
      skipped: 1,
      written: true,
    });

    const rewritten = await fs.readFile(target);
    const entries = readRegionHeader(rewritten);
    expect(entries.map((entry) => entry.timestamp)).toEqual([777, 6]);

    const raw = readRawChunk(rewritten, entries[0]);
    expect(raw.ok && raw.chunk.compression).toBe("none");
    expect(raw.ok && raw.chunk.data.toString()).toBe("replaced");
  });

  it("silently drops header entries that point at garbage", async () => {
    const file = regionFile([
      { index: 0, nbt: flatChunkNbt({ x: 0, z: 0 }) },
      { index: 1, nbt: flatChunkNbt({ x: 1, z: 0 }) },
    ]);
    file.writeUInt32BE((500 << 8) | 1, 1 * 4);
    const target = await writeRegion("r.0.0.mca", file);

    const result = await rewriteRegionFile(target, 0, 0, {
      remove: (index) => index === 0,
    });

    expect(result).toMatchObject({
      removed: 1,
      dropped: 1,
      kept: 0,
      deleted: true,
    });
  });

  it("leaves files without a header alone", async () => {
    const target = await writeRegion("r.0.0.mca", Buffer.alloc(12));
    const result = await rewriteRegionFile(target, 0, 0, {
      remove: () => true,
    });

    expect(result.unreadable).toBe(true);
    expect(result.written).toBe(false);
    expect(await fs.pathExists(target)).toBe(true);
  });
});
