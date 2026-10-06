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
  heterogeneousChunkNbt,
  legacyAnvilChunkNbt,
  levelChunkNbt,
  mcRegionChunkNbt,
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
    expect(normalizeChunkStatus("terrain")).toBe("terrain");
  });

  it("maps the 1.13 status names onto the modern ones", () => {
    expect(normalizeChunkStatus("postprocessed")).toBe("full");
    expect(normalizeChunkStatus("fullchunk")).toBe("full");
    expect(normalizeChunkStatus("mobs_spawned")).toBe("spawn");
    expect(normalizeChunkStatus("decorated")).toBe("features");
    expect(normalizeChunkStatus("liquid_carved")).toBe("liquid_carvers");
    expect(normalizeChunkStatus("carved")).toBe("carvers");
    expect(normalizeChunkStatus("base")).toBe("surface");

    const summary = scanChunkNbt(
      levelChunkNbt({ x: 0, z: 0, status: "postprocessed", dataVersion: 1631 }),
    );
    expect(summary.status).toBe("full");
  });

  it("derives the status of pre-1.13 chunks from TerrainPopulated", () => {
    const section = { y: 0, ids: new Array(4096).fill(1) };
    expect(
      scanChunkNbt(legacyAnvilChunkNbt({ x: 0, z: 0, sections: [section] }))
        .status,
    ).toBe("full");
    expect(
      scanChunkNbt(
        legacyAnvilChunkNbt({
          x: 0,
          z: 0,
          sections: [section],
          terrainPopulated: false,
        }),
      ).status,
    ).toBe("carvers");
    expect(
      scanChunkNbt(
        mcRegionChunkNbt({
          x: 0,
          z: 0,
          column: () => 1,
          terrainPopulated: false,
        }),
      ).status,
    ).toBe("carvers");
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

describe("readChunkNbtDetails across versions", () => {
  it("names the numeric biomes of pre-1.18 chunks", async () => {
    const biomes = Array.from({ length: 256 }, (_, column) =>
      column < 128 ? 4 : -127,
    );
    const details = await readChunkNbtDetails(
      legacyAnvilChunkNbt({
        x: 0,
        z: 0,
        sections: [{ y: 0, ids: new Array(4096).fill(1) }],
        biomes,
      }),
    );
    expect(details.biomes).toEqual([
      "minecraft:forest",
      "minecraft:sunflower_plains",
    ]);
    expect(details.sectionCount).toBe(1);
  });

  it("reads 26.x sections whose palette mixes bare names and block states", async () => {
    const details = await readChunkNbtDetails(
      heterogeneousChunkNbt({
        x: 0,
        z: 0,
        palette: [
          "minecraft:air",
          { Name: "minecraft:water", Properties: { level: "0" } },
        ],
        data: new Array(4096).fill(0).map((_, index) => (index < 256 ? 1 : 0)),
      }),
    );
    expect(details.sectionCount).toBe(1);
    expect(details.yMin).toBe(0);
  });

  it("leaves the section count out for McRegion chunks", async () => {
    const details = await readChunkNbtDetails(
      mcRegionChunkNbt({ x: 0, z: 0, column: () => 1 }),
    );
    expect(details.sectionCount).toBeNull();
    expect(details.legacyEntities).toEqual([{ id: "Pig", count: 1 }]);
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
