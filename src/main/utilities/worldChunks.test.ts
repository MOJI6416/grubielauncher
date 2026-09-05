import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import {
  deleteChunks,
  dimensionFolder,
  inspectChunk,
  listChunkDimensions,
  listChunkRegions,
  resetChunkInhabitedTime,
  scanChunkRegion,
} from "./worldChunks";
import { readRegionHeader } from "./anvilRegion";
import {
  compressNbt,
  entityChunkNbt,
  flatChunkNbt,
  levelChunkNbt,
  localIndex,
  poiChunkNbt,
  regionFile,
} from "./chunkFixtures.test-helpers";
import { REGION_SECTOR_BYTES } from "@/types/WorldChunks";

let root = "";
let worldPath = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-world-chunks-"));
  worldPath = path.join(root, "saves", "World");
  await fs.outputFile(path.join(worldPath, "level.dat"), "level");
});

afterEach(async () => {
  await fs.remove(root);
});

async function writeRegion(folder: string, name: string, file: Buffer) {
  const target = path.join(worldPath, folder, name);
  await fs.outputFile(target, file);
  return target;
}

describe("dimensionFolder", () => {
  it("maps vanilla ids and custom dimensions", () => {
    expect(dimensionFolder("minecraft:overworld")).toBe("");
    expect(dimensionFolder("minecraft:the_nether")).toBe("DIM-1");
    expect(dimensionFolder("minecraft:the_end")).toBe("DIM1");
    expect(dimensionFolder("mymod:mining/deep")).toBe(
      path.join("dimensions", "mymod", "mining", "deep"),
    );
    expect(dimensionFolder("bad id")).toBeNull();
    expect(dimensionFolder("mymod:../escape")).toBeNull();
  });
});

describe("listChunkDimensions", () => {
  it("always lists the overworld and finds the others by folder", async () => {
    await writeRegion(
      "region",
      "r.0.0.mca",
      regionFile([
        { index: 0, nbt: flatChunkNbt({ x: 0, z: 0 }) },
        { index: 1, nbt: flatChunkNbt({ x: 1, z: 0 }) },
      ]),
    );
    await writeRegion("entities", "r.0.0.mca", regionFile([]));
    await writeRegion(
      "DIM-1/region",
      "r.0.0.mca",
      regionFile([{ index: 5, nbt: flatChunkNbt({ x: 5, z: 0 }) }]),
    );
    await writeRegion(
      "dimensions/mymod/mining/region",
      "r.1.1.mca",
      regionFile([{ index: 0, nbt: flatChunkNbt({ x: 32, z: 32 }) }]),
    );
    await fs.ensureDir(path.join(worldPath, "dimensions", "other", "empty"));

    const dimensions = await listChunkDimensions(worldPath);

    expect(dimensions.map((dimension) => dimension.id)).toEqual([
      "minecraft:overworld",
      "minecraft:the_nether",
      "mymod:mining",
    ]);
    expect(dimensions[0]).toMatchObject({
      folder: "",
      regionCount: 1,
      chunkCount: 2,
      hasEntities: true,
      hasPoi: false,
    });
    expect(dimensions[0].sizeBytes).toBeGreaterThan(0);
    expect(dimensions[1]).toMatchObject({ folder: "DIM-1", chunkCount: 1 });
    expect(dimensions[2].folder).toBe(
      path.join("dimensions", "mymod", "mining"),
    );
  });

  it("lists only the overworld for a fresh world", async () => {
    const dimensions = await listChunkDimensions(worldPath);
    expect(dimensions).toHaveLength(1);
    expect(dimensions[0]).toMatchObject({
      id: "minecraft:overworld",
      regionCount: 0,
    });
  });
});

describe("listChunkRegions", () => {
  it("returns header-level presence for every region file", async () => {
    await writeRegion(
      "region",
      "r.-1.0.mca",
      regionFile([
        { index: localIndex(31, 0), nbt: flatChunkNbt({ x: -1, z: 0 }) },
        { index: localIndex(30, 1), nbt: flatChunkNbt({ x: -2, z: 1 }) },
      ]),
    );
    await writeRegion("region", "r.0.0.mca", Buffer.alloc(10));
    await writeRegion("region", "notes.txt", Buffer.from("skip"));

    const regions = await listChunkRegions(worldPath, "minecraft:overworld");

    expect(regions.map((region) => [region.x, region.z])).toEqual([
      [-1, 0],
      [0, 0],
    ]);
    expect(regions[0].present).toEqual([localIndex(31, 0), localIndex(30, 1)]);
    expect(regions[1].present).toEqual([]);
    expect(regions[0].modifiedAt).toBeGreaterThan(0);
  });

  it("returns nothing for an invalid dimension", async () => {
    expect(await listChunkRegions(worldPath, "../escape")).toEqual([]);
  });
});

describe("scanChunkRegion", () => {
  it("summarises every chunk and flags the broken ones", async () => {
    const fine = flatChunkNbt({
      x: -32 + 3,
      z: 64 + 4,
      inhabitedTime: 2400,
      status: "minecraft:full",
    });
    const misplaced = flatChunkNbt({ x: 0, z: 0 });
    const file = regionFile([
      { index: localIndex(3, 4), nbt: fine, timestamp: 1_700_000_100 },
      { index: localIndex(4, 4), nbt: misplaced },
      {
        index: localIndex(5, 4),
        nbt: fine,
        rawData: Buffer.from("not zlib at all"),
      },
      { index: localIndex(6, 4), nbt: fine, rawCompressionByte: 4 },
      {
        index: localIndex(7, 4),
        nbt: fine,
        rawData: Buffer.from("garbage"),
        compression: "none",
      },
    ]);
    file.writeUInt32BE((900 << 8) | 1, localIndex(8, 4) * 4);

    await writeRegion("region", "r.-1.2.mca", file);
    await writeRegion(
      "entities",
      "r.-1.2.mca",
      regionFile([
        {
          index: localIndex(3, 4),
          nbt: entityChunkNbt(-29, 68, ["minecraft:cow"]),
        },
      ]),
    );

    const scan = await scanChunkRegion(worldPath, "minecraft:overworld", -1, 2);

    expect(scan).not.toBeNull();
    expect(scan!.x).toBe(-1);
    expect(scan!.sizeBytes).toBe(file.length);

    const byX = new Map(scan!.chunks.map((chunk) => [chunk.x, chunk]));
    expect(byX.get(-29)).toMatchObject({
      x: -29,
      z: 68,
      status: "full",
      inhabitedTime: 2400,
      dataVersion: 3465,
      compression: "zlib",
      timestamp: 1_700_000_100,
      problem: null,
      hasEntities: true,
      hasPoi: false,
    });
    expect(byX.get(-28)?.problem).toBe("position");
    expect(byX.get(-27)?.problem).toBe("compression");
    expect(byX.get(-26)).toMatchObject({
      problem: "unsupported",
      compression: "lz4",
      status: null,
    });
    expect(byX.get(-25)?.problem).toBe("nbt");
    expect(byX.get(-24)).toMatchObject({ problem: "header", sectors: 1 });
    expect(byX.get(-29)?.sectors).toBeGreaterThan(0);
  });

  it("returns null for a missing region", async () => {
    expect(
      await scanChunkRegion(worldPath, "minecraft:overworld", 4, 4),
    ).toBeNull();
  });
});

describe("inspectChunk", () => {
  it("merges chunk, entity and poi data", async () => {
    await writeRegion(
      "region",
      "r.0.0.mca",
      regionFile([
        {
          index: localIndex(2, 3),
          nbt: flatChunkNbt({
            x: 2,
            z: 3,
            sections: [{ y: -1, blocks: ["minecraft:deepslate"] }, { y: 2 }],
            blockEntities: [{ id: "minecraft:chest", x: 33, y: 10, z: 50 }],
            structureStarts: { "minecraft:stronghold": "minecraft:stronghold" },
          }),
        },
      ]),
    );
    await writeRegion(
      "entities",
      "r.0.0.mca",
      regionFile([
        {
          index: localIndex(2, 3),
          nbt: entityChunkNbt(2, 3, ["minecraft:zombie", "minecraft:zombie"]),
        },
      ]),
    );
    await writeRegion(
      "poi",
      "r.0.0.mca",
      regionFile([{ index: localIndex(2, 3), nbt: poiChunkNbt(2) }]),
    );

    const details = await inspectChunk(worldPath, "minecraft:overworld", 2, 3);

    expect(details).toMatchObject({
      x: 2,
      z: 3,
      format: "flat",
      status: "full",
      yMin: -1,
      yMax: 2,
      sectionCount: 2,
      hasEntities: true,
      hasPoi: true,
      poiCount: 2,
      structureStarts: ["minecraft:stronghold"],
      entities: [{ id: "minecraft:zombie", count: 2 }],
      blockEntities: [{ id: "minecraft:chest", x: 33, y: 10, z: 50 }],
    });
    expect(details!.nbtBytes).toBeGreaterThan(0);
    expect(details!.compressedBytes).toBeGreaterThan(5);
  });

  it("falls back to entities stored in the chunk for old worlds", async () => {
    await writeRegion(
      "region",
      "r.0.0.mca",
      regionFile([
        {
          index: localIndex(0, 0),
          nbt: levelChunkNbt({ x: 0, z: 0, entities: ["minecraft:pig"] }),
        },
      ]),
    );

    const details = await inspectChunk(worldPath, "minecraft:overworld", 0, 0);
    expect(details).toMatchObject({
      format: "level",
      entities: [{ id: "minecraft:pig", count: 1 }],
      poiCount: null,
    });
  });

  it("returns null for chunks that do not exist", async () => {
    await writeRegion(
      "region",
      "r.0.0.mca",
      regionFile([{ index: 0, nbt: flatChunkNbt({ x: 0, z: 0 }) }]),
    );
    expect(
      await inspectChunk(worldPath, "minecraft:overworld", 9, 9),
    ).toBeNull();
    expect(await inspectChunk(worldPath, "minecraft:the_end", 0, 0)).toBeNull();
  });
});

describe("deleteChunks", () => {
  it("removes chunks from region, entities and poi files and compacts them", async () => {
    const chunks = [0, 1, 2].map((x) => ({
      index: localIndex(x, 0),
      nbt: flatChunkNbt({ x, z: 0 }),
    }));
    const regionPath = await writeRegion(
      "region",
      "r.0.0.mca",
      regionFile(chunks),
    );
    const entitiesPath = await writeRegion(
      "entities",
      "r.0.0.mca",
      regionFile([
        {
          index: localIndex(1, 0),
          nbt: entityChunkNbt(1, 0, ["minecraft:cow"]),
        },
      ]),
    );
    await writeRegion(
      "poi",
      "r.0.0.mca",
      regionFile([{ index: localIndex(2, 0), nbt: poiChunkNbt(1) }]),
    );
    const sizeBefore = (await fs.stat(regionPath)).size;

    let backups = 0;
    const result = await deleteChunks(
      worldPath,
      "minecraft:overworld",
      [1, 0, 2, 0, 7, 7],
      {
        backup: async () => {
          backups += 1;
          return {
            ok: true,
            pruned: 0,
            backup: {
              id: "b1",
              worldName: "World",
              worldFolder: "World",
              versionName: "v",
              createdAt: 1,
              size: 1,
              trigger: "preEdit",
            },
          };
        },
      },
    );

    expect(backups).toBe(1);
    expect(result).toMatchObject({
      ok: true,
      affected: 2,
      skipped: 1,
      regions: 1,
      removedFiles: 2,
      backupId: "b1",
    });
    expect(result.ok && result.bytesAfter).toBeLessThan(
      result.ok ? result.bytesBefore : 0,
    );

    const rewritten = await fs.readFile(regionPath);
    expect(readRegionHeader(rewritten).map((entry) => entry.index)).toEqual([
      localIndex(0, 0),
    ]);
    expect(rewritten.length).toBeLessThan(sizeBefore);
    expect(rewritten.length % REGION_SECTOR_BYTES).toBe(0);
    expect(await fs.pathExists(entitiesPath)).toBe(false);
    expect(await fs.pathExists(path.join(worldPath, "poi", "r.0.0.mca"))).toBe(
      false,
    );

    const scan = await scanChunkRegion(worldPath, "minecraft:overworld", 0, 0);
    expect(scan!.chunks).toHaveLength(1);
    expect(scan!.chunks[0].problem).toBeNull();
  });

  it("validates the request before touching anything", async () => {
    await writeRegion(
      "region",
      "r.0.0.mca",
      regionFile([{ index: 0, nbt: flatChunkNbt({ x: 0, z: 0 }) }]),
    );

    expect(await deleteChunks(worldPath, "minecraft:overworld", [])).toEqual({
      ok: false,
      error: "nothingSelected",
    });
    expect(
      await deleteChunks(worldPath, "minecraft:overworld", [1, 2, 3]),
    ).toEqual({
      ok: false,
      error: "nothingSelected",
    });
    expect(await deleteChunks(worldPath, "minecraft:the_end", [0, 0])).toEqual({
      ok: false,
      error: "dimensionMissing",
    });
    expect(
      await deleteChunks(
        path.join(root, "nope"),
        "minecraft:overworld",
        [0, 0],
      ),
    ).toEqual({
      ok: false,
      error: "worldMissing",
    });
  });

  it("aborts when the safety backup fails", async () => {
    const regionPath = await writeRegion(
      "region",
      "r.0.0.mca",
      regionFile([{ index: 0, nbt: flatChunkNbt({ x: 0, z: 0 }) }]),
    );
    const before = await fs.readFile(regionPath);

    const result = await deleteChunks(
      worldPath,
      "minecraft:overworld",
      [0, 0],
      {
        backup: async () => ({ ok: false, error: "worldTooLarge" }),
      },
    );

    expect(result).toEqual({
      ok: false,
      error: "backupFailed",
      backupError: "worldTooLarge",
    });
    expect(await fs.readFile(regionPath)).toEqual(before);
  });
});

describe("resetChunkInhabitedTime", () => {
  it("zeroes the counter for selected chunks and leaves the others alone", async () => {
    const regionPath = await writeRegion(
      "region",
      "r.0.0.mca",
      regionFile([
        {
          index: localIndex(0, 0),
          nbt: flatChunkNbt({ x: 0, z: 0, inhabitedTime: 500 }),
          compression: "gzip",
        },
        {
          index: localIndex(1, 0),
          nbt: flatChunkNbt({ x: 1, z: 0, inhabitedTime: 600 }),
        },
        {
          index: localIndex(2, 0),
          nbt: levelChunkNbt({ x: 2, z: 0, inhabitedTime: 700 }),
        },
        {
          index: localIndex(3, 0),
          nbt: flatChunkNbt({ x: 3, z: 0, inhabitedTime: 0 }),
        },
        {
          index: localIndex(4, 0),
          nbt: flatChunkNbt({ x: 4, z: 0, inhabitedTime: 9 }),
          rawCompressionByte: 4,
        },
      ]),
    );

    const result = await resetChunkInhabitedTime(
      worldPath,
      "minecraft:overworld",
      [0, 0, 2, 0, 3, 0, 4, 0],
      { now: 1_800_000_000 },
    );

    expect(result).toMatchObject({
      ok: true,
      affected: 2,
      skipped: 2,
      regions: 1,
      backupId: null,
    });

    const scan = await scanChunkRegion(worldPath, "minecraft:overworld", 0, 0);
    const byX = new Map(scan!.chunks.map((chunk) => [chunk.x, chunk]));
    expect(byX.get(0)).toMatchObject({
      inhabitedTime: 0,
      compression: "gzip",
      timestamp: 1_800_000_000,
    });
    expect(byX.get(1)).toMatchObject({
      inhabitedTime: 600,
      timestamp: 1_700_000_000,
    });
    expect(byX.get(2)).toMatchObject({
      inhabitedTime: 0,
      timestamp: 1_800_000_000,
    });
    expect(byX.get(3)?.inhabitedTime).toBe(0);
    expect(byX.get(4)?.problem).toBe("unsupported");
    expect((await fs.readFile(regionPath)).length % REGION_SECTOR_BYTES).toBe(
      0,
    );
    expect(compressNbt(flatChunkNbt({ x: 0, z: 0 })).length).toBeGreaterThan(0);
  });
});
