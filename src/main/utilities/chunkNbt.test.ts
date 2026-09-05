import { describe, expect, it } from "vitest";
import {
  groupEntities,
  normalizeChunkStatus,
  patchChunkInhabitedTime,
  readChunkNbtDetails,
  readEntityChunk,
  readPoiChunk,
  scanChunkNbt,
} from "./chunkNbt";
import { NbtScanError, readNbtRoot } from "./nbtScan";
import {
  entityChunkNbt,
  flatChunkNbt,
  levelChunkNbt,
  poiChunkNbt,
} from "./chunkFixtures.test-helpers";

describe("scanChunkNbt", () => {
  it("reads the 1.18+ flat layout", () => {
    const buffer = flatChunkNbt({
      x: -7,
      z: 12,
      status: "minecraft:light",
      inhabitedTime: 36_000,
      lastUpdate: 987,
      dataVersion: 3700,
      sections: [{ y: -4 }, { y: 0 }, { y: 3 }],
      lightOn: false,
    });

    const summary = scanChunkNbt(buffer);

    expect(summary).toMatchObject({
      format: "flat",
      status: "light",
      inhabitedTime: 36_000,
      lastUpdate: 987,
      dataVersion: 3700,
      xPos: -7,
      zPos: 12,
      yPos: -4,
      lightOn: false,
      sectionCount: 3,
    });
    expect(summary.inhabitedTimeOffset).toBeGreaterThan(0);
  });

  it("reads the pre-1.18 Level layout", () => {
    const buffer = levelChunkNbt({
      x: 3,
      z: -4,
      status: "full",
      inhabitedTime: 12,
      dataVersion: 2586,
    });
    const summary = scanChunkNbt(buffer);

    expect(summary).toMatchObject({
      format: "level",
      status: "full",
      inhabitedTime: 12,
      dataVersion: 2586,
      xPos: 3,
      zPos: -4,
      sectionCount: 2,
      lightOn: null,
    });
  });

  it("rejects payloads that are not a compound", () => {
    expect(() => scanChunkNbt(Buffer.from([0x08, 0x00, 0x00]))).toThrow(
      NbtScanError,
    );
    expect(() =>
      scanChunkNbt(Buffer.from([0x0a, 0x00, 0x00, 0x03, 0x00, 0x01])),
    ).toThrow(NbtScanError);
  });

  it("normalises status names", () => {
    expect(normalizeChunkStatus("minecraft:full")).toBe("full");
    expect(normalizeChunkStatus("  Structure_Starts ")).toBe(
      "structure_starts",
    );
  });
});

describe("patchChunkInhabitedTime", () => {
  it("replaces only the long in place", () => {
    const buffer = flatChunkNbt({ x: 0, z: 0, inhabitedTime: 99_999 });
    const summary = scanChunkNbt(buffer);
    const patched = patchChunkInhabitedTime(
      buffer,
      summary.inhabitedTimeOffset!,
      0,
    );

    expect(patched.length).toBe(buffer.length);
    expect(scanChunkNbt(patched).inhabitedTime).toBe(0);
    expect(scanChunkNbt(patched).status).toBe(summary.status);
    expect(readNbtRoot(patched).end).toBe(patched.length);
    expect(scanChunkNbt(buffer).inhabitedTime).toBe(99_999);
  });
});

describe("readChunkNbtDetails", () => {
  it("collects sections, biomes, structures and block entities", async () => {
    const buffer = flatChunkNbt({
      x: 1,
      z: 2,
      sections: [
        { y: -4, blocks: ["minecraft:air"] },
        {
          y: 0,
          blocks: ["minecraft:stone", "minecraft:dirt"],
          biomes: ["minecraft:plains"],
        },
        {
          y: 5,
          blocks: ["minecraft:grass_block"],
          biomes: ["minecraft:forest", "minecraft:plains"],
        },
      ],
      blockEntities: [
        { id: "minecraft:chest", x: 16, y: 64, z: 32 },
        { id: "minecraft:furnace", x: 17, y: 70, z: 33 },
        { id: "minecraft:chest", x: 18, y: 60, z: 34 },
      ],
      structureStarts: {
        "minecraft:village_plains": "minecraft:village_plains",
        "minecraft:mineshaft": "INVALID",
      },
      structureReferences: {
        "minecraft:village_plains": [1, 2],
        "minecraft:ruined_portal": [],
      },
    });

    const details = await readChunkNbtDetails(buffer);

    expect(details.format).toBe("flat");
    expect(details.yMin).toBe(0);
    expect(details.yMax).toBe(5);
    expect(details.sectionCount).toBe(2);
    expect(details.biomes).toEqual(["minecraft:forest", "minecraft:plains"]);
    expect(details.heightmaps).toEqual(["MOTION_BLOCKING", "WORLD_SURFACE"]);
    expect(details.structureStarts).toEqual(["minecraft:village_plains"]);
    expect(details.structureReferences).toEqual(["minecraft:village_plains"]);
    expect(
      details.blockEntities.map((entity) => `${entity.id}@${entity.y}`),
    ).toEqual([
      "minecraft:chest@60",
      "minecraft:chest@64",
      "minecraft:furnace@70",
    ]);
    expect(details.lightOn).toBe(true);
    expect(details.nbtBytes).toBe(buffer.length);
  });

  it("reads legacy entities and tile entities from the Level compound", async () => {
    const buffer = levelChunkNbt({
      x: 0,
      z: 0,
      entities: ["minecraft:cow", "minecraft:cow", "minecraft:zombie"],
      tileEntities: [{ id: "minecraft:sign", x: 1, y: 2, z: 3 }],
    });

    const details = await readChunkNbtDetails(buffer);

    expect(details.format).toBe("level");
    expect(details.legacyEntities).toEqual([
      { id: "minecraft:cow", count: 2 },
      { id: "minecraft:zombie", count: 1 },
    ]);
    expect(details.blockEntities).toEqual([
      { id: "minecraft:sign", x: 1, y: 2, z: 3 },
    ]);
    expect(details.sectionCount).toBe(1);
    expect(details.yMin).toBe(0);
  });
});

describe("side chunks", () => {
  it("groups entities by id, most frequent first", async () => {
    const groups = await readEntityChunk(
      entityChunkNbt(0, 0, [
        "minecraft:sheep",
        "minecraft:item",
        "minecraft:sheep",
      ]),
    );
    expect(groups).toEqual([
      { id: "minecraft:sheep", count: 2 },
      { id: "minecraft:item", count: 1 },
    ]);
    expect(groupEntities("nope")).toEqual([]);
  });

  it("counts poi records across sections", async () => {
    expect(await readPoiChunk(poiChunkNbt(3))).toBe(3);
    expect(await readPoiChunk(poiChunkNbt(0))).toBe(0);
  });
});
