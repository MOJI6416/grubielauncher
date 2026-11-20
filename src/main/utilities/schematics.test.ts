import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import {
  countPackedIndices,
  inspectSchematic,
  legacyBlockState,
  listSchematics,
  parseSchematicBuffer,
  safeSchematicSegments,
  transferSchematic,
} from "./schematics";
import {
  encodeVarints,
  nbt,
  packLitematicStates,
  writeTestNbt,
} from "./testNbt";

const FIXTURES = path.join(__dirname, "fixtures", "schematics");

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, name));
}

function blockOf(state: string) {
  const [name] = state.split("[");
  return nbt.compound({ Name: nbt.string(name) });
}

function counts(blocks: { id: string; count: number }[]) {
  return Object.fromEntries(blocks.map((block) => [block.id, block.count]));
}

describe("real schematic files", () => {
  it("reads a WorldEdit Sponge v2 schematic", async () => {
    const details = await parseSchematicBuffer(fixture("smallhouse1.schem"));
    expect(details).toMatchObject({
      format: "sponge",
      formatVersion: 2,
      dataVersion: 2584,
      size: { x: 21, y: 28, z: 20 },
      volume: 11760,
      blockCount: 3201,
      blockTypes: 56,
      blockEntities: 72,
    });
    expect(details?.blocks[0]).toEqual({
      id: "minecraft:spruce_stairs",
      count: 513,
    });
  });

  it("reads a Sponge v3 schematic with the nested root", async () => {
    const details = await parseSchematicBuffer(fixture("worldedit-v3.schem"));
    expect(details).toMatchObject({
      format: "sponge",
      formatVersion: 3,
      dataVersion: 3955,
      size: { x: 16, y: 4, z: 16 },
      volume: 1024,
      blockCount: 1016,
    });
    expect(details?.blocks.every((block) => !block.id.includes("["))).toBe(true);
  });

  it("reads an MCEdit schematic with numeric block ids", async () => {
    const details = await parseSchematicBuffer(
      fixture("viking-house1.schematic"),
    );
    expect(details).toMatchObject({
      format: "mcedit",
      size: { x: 23, y: 35, z: 23 },
      volume: 18515,
      blockCount: 2492,
      blockTypes: 14,
    });
    expect(counts(details?.blocks ?? [])).toMatchObject({
      "minecraft:spruce_planks": 485,
      "minecraft:spruce_log": 472,
      "minecraft:oak_stairs": 416,
      "minecraft:oak_door": 1,
      "minecraft:torch": 23,
    });
  });
});

describe("Litematica", () => {
  function litematic(
    regions: Record<
      string,
      {
        position: [number, number, number];
        size: [number, number, number];
        palette: string[];
        cells: number[];
      }
    >,
    meta: Record<string, ReturnType<typeof nbt.string>> = {},
  ) {
    return writeTestNbt({
      Version: nbt.int(6),
      MinecraftDataVersion: nbt.int(3700),
      Metadata: nbt.compound({
        Name: nbt.string("Tower"),
        Author: nbt.string("Builder"),
        Description: nbt.string(""),
        TimeCreated: nbt.long(1700000000000),
        TimeModified: nbt.long(1700000500000),
        ...meta,
      }),
      Regions: nbt.compound(
        Object.fromEntries(
          Object.entries(regions).map(([key, region]) => {
            const bits = Math.max(
              2,
              32 - Math.clz32(region.palette.length - 1),
            );
            return [
              key,
              nbt.compound({
                Position: nbt.compound({
                  x: nbt.int(region.position[0]),
                  y: nbt.int(region.position[1]),
                  z: nbt.int(region.position[2]),
                }),
                Size: nbt.compound({
                  x: nbt.int(region.size[0]),
                  y: nbt.int(region.size[1]),
                  z: nbt.int(region.size[2]),
                }),
                BlockStatePalette: nbt.list(10, region.palette.map(blockOf)),
                BlockStates: nbt.longs(
                  packLitematicStates(region.cells, bits),
                ),
                TileEntities: nbt.list(10, []),
                Entities: nbt.list(10, []),
              }),
            ];
          }),
        ),
      ),
    });
  }

  it("unpacks states that cross long boundaries and adds up regions", async () => {
    const palette = [
      "minecraft:air",
      "minecraft:stone",
      "minecraft:oak_planks",
      "minecraft:glass",
      "minecraft:torch[facing=up]",
    ];
    const cells = Array.from({ length: 4 * 3 * 5 }, (_, index) => index % 5);
    const second = Array.from({ length: 2 * 2 * 2 }, () => 1);

    const details = await parseSchematicBuffer(
      litematic({
        main: { position: [0, 0, 0], size: [4, 3, 5], palette, cells },
        roof: {
          position: [5, 2, 4],
          size: [-2, 2, -2],
          palette: ["minecraft:air", "minecraft:stone"],
          cells: second,
        },
      }),
    );

    expect(details).toMatchObject({
      format: "litematic",
      formatVersion: 6,
      dataVersion: 3700,
      name: "Tower",
      author: "Builder",
      description: null,
      regions: 2,
      size: { x: 6, y: 4, z: 5 },
      volume: 68,
      blockCount: 56,
      blockTypes: 4,
      createdAt: 1700000000000,
    });
    expect(counts(details?.blocks ?? [])).toEqual({
      "minecraft:stone": 20,
      "minecraft:oak_planks": 12,
      "minecraft:glass": 12,
      "minecraft:torch": 12,
    });
  });

  it("counts wide palettes", async () => {
    const palette = [
      "minecraft:air",
      ...Array.from({ length: 40 }, (_, index) => `test:block_${index}`),
    ];
    const cells = Array.from({ length: 7 * 9 * 11 }, (_, index) => index % 41);

    const details = await parseSchematicBuffer(
      litematic({ only: { position: [0, 0, 0], size: [7, 9, 11], palette, cells } }),
    );

    expect(details?.blockTypes).toBe(40);
    expect(details?.blockCount).toBe(cells.filter((cell) => cell !== 0).length);
    expect(counts(details?.blocks ?? [])["test:block_39"]).toBe(
      cells.filter((cell) => cell === 40).length,
    );
  });

  it("reads 32-bit packed values", () => {
    const words = new Uint32Array([0xffffffff, 7]);
    expect(Array.from(countPackedIndices(words, 2, 3, 4))).toEqual([0, 0, 0, 3]);
    expect(Array.from(countPackedIndices(words, 32, 2, 8))).toEqual([
      0, 0, 0, 0, 0, 0, 0, 1,
    ]);
  });
});

describe("Sponge", () => {
  it("decodes multi-byte varints of a v2 palette", async () => {
    const palette = Array.from(
      { length: 200 },
      (_, index) => `minecraft:block_${index}[lit=false]`,
    );
    const cells = Array.from({ length: 10 * 2 * 10 }, (_, index) => index);

    const details = await parseSchematicBuffer(
      writeTestNbt(
        {
          Version: nbt.int(2),
          DataVersion: nbt.int(2586),
          Width: nbt.short(10),
          Height: nbt.short(2),
          Length: nbt.short(10),
          PaletteMax: nbt.int(palette.length),
          Palette: nbt.compound(
            Object.fromEntries(palette.map((name, index) => [name, nbt.int(index)])),
          ),
          BlockData: nbt.bytes(encodeVarints(cells)),
          BlockEntities: nbt.list(10, [nbt.compound({ Id: nbt.string("x") })]),
          Metadata: nbt.compound({
            Name: nbt.string("Gate"),
            Author: nbt.string("Mason"),
          }),
        },
        "Schematic",
      ),
    );

    expect(details).toMatchObject({
      format: "sponge",
      formatVersion: 2,
      size: { x: 10, y: 2, z: 10 },
      blockCount: 200,
      blockTypes: 200,
      blockEntities: 1,
      name: "Gate",
      author: "Mason",
    });
    expect(counts(details?.blocks ?? [])["minecraft:block_199"]).toBe(1);
  });

  it("reads widths above 32767 as unsigned shorts", async () => {
    const details = await parseSchematicBuffer(
      writeTestNbt(
        {
          Schematic: nbt.compound({
            Version: nbt.int(3),
            Width: nbt.short(-25536),
            Height: nbt.short(1),
            Length: nbt.short(1),
            Blocks: nbt.compound({
              Palette: nbt.compound({ "minecraft:air": nbt.int(0) }),
              Data: nbt.bytes([]),
            }),
          }),
        },
        "",
      ),
    );

    expect(details?.size.x).toBe(40000);
  });
});

describe("MCEdit and Schematica", () => {
  it("joins AddBlocks nibbles and uses the Schematica mapping", async () => {
    const blocks = [1, 54, 0xd2, 0x08, 0x10];
    const add = [0x00, 0x01, 0x01];
    const details = await parseSchematicBuffer(
      writeTestNbt(
        {
          Width: nbt.short(5),
          Height: nbt.short(1),
          Length: nbt.short(1),
          Materials: nbt.string("Alpha"),
          Blocks: nbt.bytes(blocks),
          AddBlocks: nbt.bytes(add),
          Data: nbt.bytes([0, 0, 0, 0, 0]),
          SchematicaMapping: nbt.compound({
            "mymod:crusher": nbt.short(0x1d2),
          }),
          TileEntities: nbt.list(10, []),
          Entities: nbt.list(10, []),
        },
        "Schematic",
      ),
    );

    expect(counts(details?.blocks ?? [])).toEqual({
      "minecraft:stone": 1,
      "minecraft:chest": 1,
      "mymod:crusher": 1,
      "minecraft:water": 1,
      "legacy:272": 1,
    });
  });

  it("turns 1.12 ids and data into modern states", () => {
    expect(legacyBlockState(1, 0)).toBe("minecraft:stone");
    expect(legacyBlockState(1, 3)).toBe("minecraft:diorite");
    expect(legacyBlockState(54, 3)).toBe("minecraft:chest[facing=south]");
    expect(legacyBlockState(152, 0)).toBe("minecraft:redstone_block");
    expect(legacyBlockState(219, 0)).toBe("minecraft:white_shulker_box");
    expect(legacyBlockState(251, 14)).toBe("minecraft:red_concrete");
    expect(legacyBlockState(35, 8)).toBe("minecraft:light_gray_wool");
    expect(legacyBlockState(53, 6)).toBe("minecraft:oak_stairs[facing=south,half=top]");
    expect(legacyBlockState(44, 12)).toBe("minecraft:brick_slab[type=top]");
    expect(legacyBlockState(17, 5)).toBe("minecraft:spruce_log[axis=x]");
    expect(legacyBlockState(17, 12)).toBe("minecraft:oak_wood[axis=y]");
    expect(legacyBlockState(50, 1)).toBe("minecraft:wall_torch[facing=east]");
    expect(legacyBlockState(50, 5)).toBe("minecraft:torch");
    expect(legacyBlockState(64, 8)).toBe("minecraft:oak_door[half=upper,hinge=left]");
    expect(legacyBlockState(155, 2)).toBe("minecraft:quartz_pillar[axis=y]");
    expect(legacyBlockState(253, 0)).toBe("legacy:253");
    expect(legacyBlockState(500, 0, new Map([[500, "mymod:crusher"]]))).toBe(
      "mymod:crusher",
    );
  });
});

describe("structure files", () => {
  function structure(palette: ReturnType<typeof nbt.list>, key = "palette") {
    const states = [0, 1, 1, 2, 3];
    return writeTestNbt({
      DataVersion: nbt.int(4600),
      size: nbt.list(3, [nbt.int(3), nbt.int(2), nbt.int(1)]),
      [key]:
        key === "palette" ? palette : nbt.list(9, [palette, palette]),
      blocks: nbt.list(
        10,
        states.map((state, index) =>
          nbt.compound({
            state: nbt.int(state),
            pos: nbt.list(3, [nbt.int(index % 3), nbt.int(0), nbt.int(0)]),
            ...(state === 2
              ? { nbt: nbt.compound({ id: nbt.string("minecraft:chest") }) }
              : {}),
          }),
        ),
      ),
      entities: nbt.list(10, []),
    });
  }

  it("reads the 26.x palette with bare names", async () => {
    const details = await parseSchematicBuffer(
      structure(
        nbt.list(10, [
          nbt.compound({ "": nbt.string("minecraft:air") }),
          nbt.compound({ "": nbt.string("minecraft:stone") }),
          nbt.compound({
            Name: nbt.string("minecraft:chest"),
            Properties: nbt.compound({ facing: nbt.string("north") }),
          }),
          nbt.compound({ "": nbt.string("minecraft:structure_void") }),
        ]),
      ),
    );

    expect(details).toMatchObject({
      format: "structure",
      dataVersion: 4600,
      size: { x: 3, y: 2, z: 1 },
      blockCount: 3,
      blockEntities: 1,
      entities: 0,
    });
    expect(counts(details?.blocks ?? [])).toEqual({
      "minecraft:stone": 2,
      "minecraft:chest": 1,
    });
  });

  it("takes the first variant of a multi-palette structure", async () => {
    const details = await parseSchematicBuffer(
      structure(
        nbt.list(10, [
          blockOf("minecraft:air"),
          blockOf("minecraft:dirt"),
          blockOf("minecraft:barrel"),
          blockOf("minecraft:glass"),
        ]),
        "palettes",
      ),
    );

    expect(counts(details?.blocks ?? [])).toEqual({
      "minecraft:dirt": 2,
      "minecraft:barrel": 1,
      "minecraft:glass": 1,
    });
  });

  it("reads uncompressed NBT", async () => {
    const details = await parseSchematicBuffer(
      writeTestNbt(
        {
          size: nbt.list(3, [nbt.int(1), nbt.int(1), nbt.int(1)]),
          palette: nbt.list(10, [blockOf("minecraft:stone")]),
          blocks: nbt.list(10, [nbt.compound({ state: nbt.int(0) })]),
        },
        "",
        "none",
      ),
    );

    expect(details?.blockCount).toBe(1);
  });
});

describe("schematics on disk", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-schematics-"));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  it("lists the Litematica and WorldEdit folders and skips other files", async () => {
    const instance = path.join(root, "instance");
    await fs.outputFile(
      path.join(instance, "schematics", "houses", "small.litematic"),
      fixture("smallhouse1.schem"),
    );
    await fs.outputFile(
      path.join(instance, "schematics", "notes.txt"),
      "not a schematic",
    );
    await fs.outputFile(
      path.join(instance, "config", "worldedit", "schematics", "gate.schem"),
      fixture("worldedit-v3.schem"),
    );
    await fs.outputFile(
      path.join(instance, "schematics", ".hidden", "skip.nbt"),
      "x",
    );

    const files = await listSchematics(instance);

    expect(files.map((file) => file.relativePath).sort()).toEqual([
      "config/worldedit/schematics/gate.schem",
      "schematics/houses/small.litematic",
    ]);
    expect(files.find((file) => file.folder === "worldedit")).toMatchObject({
      name: "gate",
      fileName: "gate.schem",
      format: "sponge",
    });
  });

  it("reports unreadable and missing files", async () => {
    const broken = path.join(root, "broken.litematic");
    await fs.outputFile(broken, Buffer.from([0x1f, 0x8b, 1, 2, 3]));

    expect(await inspectSchematic(broken)).toEqual({
      ok: false,
      error: "unreadable",
    });
    expect(await inspectSchematic(path.join(root, "none.schem"))).toEqual({
      ok: false,
      error: "missing",
    });
  });

  it("rejects paths outside the schematic folders", () => {
    expect(safeSchematicSegments("schematics/a/b.litematic")).toEqual([
      "schematics",
      "a",
      "b.litematic",
    ]);
    expect(safeSchematicSegments("schematics/../mods/a.litematic")).toBeNull();
    expect(safeSchematicSegments("mods/a.litematic")).toBeNull();
    expect(safeSchematicSegments("schematics/a.jar")).toBeNull();
    expect(safeSchematicSegments("schematics")).toBeNull();
  });

  it("copies and moves into another instance without overwriting", async () => {
    const from = path.join(root, "from");
    const to = path.join(root, "to");
    const relative = "schematics/base.litematic";
    await fs.outputFile(path.join(from, relative), "one");
    await fs.outputFile(path.join(to, relative), "existing");

    const copied = await transferSchematic(from, relative, to, "copy");
    expect(copied).toMatchObject({
      ok: true,
      relativePath: "schematics/base (2).litematic",
    });
    expect(await fs.readFile(path.join(to, relative), "utf8")).toBe("existing");
    expect(await fs.pathExists(path.join(from, relative))).toBe(true);

    const moved = await transferSchematic(from, relative, to, "move");
    expect(moved).toMatchObject({
      ok: true,
      relativePath: "schematics/base (3).litematic",
    });
    expect(await fs.pathExists(path.join(from, relative))).toBe(false);

    expect(await transferSchematic(to, relative, to, "copy")).toEqual({
      ok: false,
      error: "sameInstance",
    });
  });
});
