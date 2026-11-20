import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { PNG } from "pngjs";
import { TestZip } from "./testZip";
import { nbt, writeTestNbt } from "./testNbt";

const hoisted = vi.hoisted(() => ({ appData: "", opened: [] as string[] }));

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.appData },
}));

vi.mock("./archiver", async (importOriginal) => {
  const original = await importOriginal<typeof import("./archiver")>();
  return {
    ...original,
    openArchive: (file: string, limits?: Parameters<typeof original.openArchive>[1]) => {
      hoisted.opened.push(path.basename(file));
      return original.openArchive(file, limits);
    },
  };
});

import { describeBlocks } from "./blockInfo";
import { bakeBlockModels, selectVariants } from "./blockModels";
import { parseSchematicBuffer } from "./schematics";
import { loadSchematicVolume } from "./schematicVolume";

const CUBE = {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: Object.fromEntries(
        ["down", "up", "north", "south", "west", "east"].map((face) => [
          face,
          { texture: `#${face}`, cullface: face },
        ]),
      ),
    },
  ],
};

const CUBE_ALL = {
  parent: "block/cube",
  textures: Object.fromEntries(
    ["particle", "down", "up", "north", "south", "west", "east"].map((face) => [
      face,
      "#all",
    ]),
  ),
};

function png(color: [number, number, number, number]): Buffer {
  const image = new PNG({ width: 16, height: 16 });
  for (let index = 0; index < 256; index += 1) image.data.set(color, index * 4);
  return PNG.sync.write(image);
}

function json(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

let instance = "";

function fullBlock(zip: TestZip, namespace: string, name: string, color: [number, number, number, number]) {
  zip.addFile(
    `assets/${namespace}/blockstates/${name}.json`,
    json({ variants: { "": { model: `${namespace}:block/${name}` } } }),
  );
  zip.addFile(
    `assets/${namespace}/models/block/${name}.json`,
    json({ parent: "minecraft:block/cube_all", textures: { all: `${namespace}:block/${name}` } }),
  );
  zip.addFile(`assets/${namespace}/textures/block/${name}.png`, png(color));
}

beforeAll(async () => {
  hoisted.appData = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-blocks-"));
  const minecraft = path.join(hoisted.appData, ".grubielauncher", "minecraft");
  instance = path.join(minecraft, "versions", "Pack 26.3");
  await fs.ensureDir(path.join(instance, "mods"));
  await fs.writeJson(path.join(instance, "version.json"), { version: { id: "26.3" } });
  await fs.writeJson(path.join(instance, "26.3.json"), { id: "26.3", assetIndex: { id: "30" } });

  const game = new TestZip();
  game.addFile("assets/minecraft/models/block/cube.json", json(CUBE));
  game.addFile("assets/minecraft/models/block/cube_all.json", json(CUBE_ALL));
  game.addFile(
    "assets/minecraft/lang/en_us.json",
    json({
      "block.minecraft.stone_bricks": "Stone Bricks",
      "block.minecraft.mossy_stone_bricks": "Mossy Stone Bricks",
      "block.minecraft.light_gray_wool": "Light Gray Wool",
      "block.minecraft.water": "Water",
    }),
  );
  fullBlock(game, "minecraft", "stone_bricks", [120, 120, 120, 255]);
  fullBlock(game, "minecraft", "mossy_stone_bricks", [90, 120, 90, 255]);
  fullBlock(game, "minecraft", "light_gray_wool", [160, 160, 160, 255]);
  game.addFile("assets/minecraft/textures/block/water_still.png", png([200, 200, 200, 180]));
  game.addFile(
    "assets/minecraft/blockstates/oak_stairs.json",
    json({
      variants: {
        "facing=east,half=bottom,shape=straight": { model: "minecraft:block/oak_stairs" },
        "facing=south,half=bottom,shape=straight": {
          model: "minecraft:block/oak_stairs",
          y: 90,
          uvlock: true,
        },
      },
    }),
  );
  game.addFile(
    "assets/minecraft/models/block/oak_stairs.json",
    json({
      textures: { side: "minecraft:block/stone_bricks" },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 8, 16],
          faces: {
            down: { texture: "#side", cullface: "down" },
            up: { texture: "#side" },
            east: { texture: "#side", cullface: "east" },
          },
        },
        {
          from: [8, 8, 0],
          to: [16, 16, 16],
          faces: { east: { texture: "#side", cullface: "east" } },
        },
      ],
    }),
  );
  game.writeZip(path.join(instance, "26.3.jar"));

  const hash = "a".repeat(40);
  await fs.outputJson(path.join(minecraft, "assets", "indexes", "30.json"), {
    objects: { "minecraft/lang/de_de.json": { hash, size: 10 } },
  });
  await fs.outputJson(path.join(minecraft, "assets", "objects", "aa", hash), {
    "block.minecraft.stone_bricks": "Steinziegel",
  });

  const mod = new TestZip();
  fullBlock(mod, "mymod", "crusher", [200, 80, 40, 255]);
  mod.addFile("assets/mymod/lang/en_us.json", json({ "block.mymod.crusher": "Crusher" }));
  mod.addFile("assets/mymod/lang/de_de.json", json({ "block.mymod.crusher": "Brecher" }));
  mod.writeZip(path.join(instance, "mods", "mymod-1.0.jar"));

  const legacyMod = new TestZip();
  legacyMod.addFile("assets/oldmod/lang/en_US.lang", Buffer.from("tile.oldmod.press.name=Old Press\n"));
  legacyMod.addFile("assets/oldmod/textures/blocks/press.png", png([40, 40, 200, 255]));
  legacyMod.writeZip(path.join(instance, "mods", "oldmod-1.12.2.jar"));
});

afterAll(async () => {
  await fs.remove(hoisted.appData);
});

function decodeIcon(url: string | null) {
  expect(url).toMatch(/^data:image\/png;base64,/);
  const image = PNG.sync.read(Buffer.from(url!.split(",")[1], "base64"));
  let opaque = 0;
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] > 0) opaque += 1;
  }
  return { width: image.width, opaque };
}

describe("26.x palettes", () => {
  it("names and draws a vanilla and a modded block from a {\"\": id} palette", async () => {
    const details = await parseSchematicBuffer(
      writeTestNbt(
        {
          DataVersion: nbt.int(4556),
          size: nbt.list(3, [nbt.int(2), nbt.int(1), nbt.int(1)]),
          palette: nbt.list(10, [
            nbt.compound({ "": nbt.string("minecraft:stone_bricks") }),
            nbt.compound({ Name: nbt.string("mymod:crusher") }),
          ]),
          blocks: nbt.list(10, [
            nbt.compound({
              pos: nbt.list(3, [nbt.int(0), nbt.int(0), nbt.int(0)]),
              state: nbt.int(0),
            }),
            nbt.compound({
              pos: nbt.list(3, [nbt.int(1), nbt.int(0), nbt.int(0)]),
              state: nbt.int(1),
            }),
          ]),
          entities: nbt.list(10, []),
        },
        "",
      ),
    );
    const ids = details!.blocks.map((block) => block.id).sort();
    expect(ids).toEqual(["minecraft:stone_bricks", "mymod:crusher"]);

    const de = await describeBlocks(instance, ids, "de");
    expect(de["minecraft:stone_bricks"].name).toBe("Steinziegel");
    expect(de["mymod:crusher"].name).toBe("Brecher");
    for (const id of ids) {
      const icon = decodeIcon(de[id].icon);
      expect(icon.width).toBe(64);
      expect(icon.opaque).toBeGreaterThan(1000);
    }

    const en = await describeBlocks(instance, ids, "en");
    expect(en["minecraft:stone_bricks"].name).toBe("Stone Bricks");
    expect(en["mymod:crusher"].name).toBe("Crusher");
  });

  it("falls back to en_us and then to a readable id", async () => {
    const result = await describeBlocks(
      instance,
      ["minecraft:light_gray_wool", "minecraft:polished_tuff_wall"],
      "de",
    );
    expect(result["minecraft:light_gray_wool"].name).toBe("Light Gray Wool");
    expect(result["minecraft:polished_tuff_wall"]).toEqual({
      name: "Polished Tuff Wall",
      icon: null,
    });
  });

  it("keeps icons on disk and does not open the jars again", async () => {
    await describeBlocks(instance, ["minecraft:stone_bricks", "mymod:crusher"], "ru");
    hoisted.opened.length = 0;
    const again = await describeBlocks(instance, ["minecraft:stone_bricks", "mymod:crusher"], "en");
    expect(again["mymod:crusher"].icon).not.toBeNull();
    expect(hoisted.opened).toEqual([]);
  });
});

describe("1.12 palettes", () => {
  it("names numeric MCEdit blocks and a Schematica-mapped mod block", async () => {
    const details = await parseSchematicBuffer(
      writeTestNbt(
        {
          Width: nbt.short(3),
          Height: nbt.short(1),
          Length: nbt.short(1),
          Materials: nbt.string("Alpha"),
          Blocks: nbt.bytes([98, 35, 600 & 0xff]),
          AddBlocks: nbt.bytes([0x00, 0x02]),
          Data: nbt.bytes([0, 8, 0]),
          SchematicaMapping: nbt.compound({ "oldmod:press": nbt.short(600) }),
          TileEntities: nbt.list(10, []),
          Entities: nbt.list(10, []),
        },
        "Schematic",
      ),
    );
    const ids = details!.blocks.map((block) => block.id).sort();
    expect(ids).toEqual(["minecraft:light_gray_wool", "minecraft:stone_bricks", "oldmod:press"]);

    const en = await describeBlocks(instance, ids, "en");
    expect(en["minecraft:stone_bricks"].name).toBe("Stone Bricks");
    expect(en["minecraft:light_gray_wool"].name).toBe("Light Gray Wool");
    expect(en["oldmod:press"].name).toBe("Old Press");
    expect(decodeIcon(en["oldmod:press"].icon).opaque).toBeGreaterThan(1000);
  });

  it("modernizes a 1.12 structure palette with variants and colours", async () => {
    const details = await parseSchematicBuffer(
      writeTestNbt(
        {
          DataVersion: nbt.int(1343),
          size: nbt.list(3, [nbt.int(2), nbt.int(1), nbt.int(1)]),
          palette: nbt.list(10, [
            nbt.compound({
              Name: nbt.string("minecraft:stonebrick"),
              Properties: nbt.compound({ variant: nbt.string("mossy_stonebrick") }),
            }),
            nbt.compound({
              Name: nbt.string("minecraft:wool"),
              Properties: nbt.compound({ color: nbt.string("silver") }),
            }),
          ]),
          blocks: nbt.list(10, [
            nbt.compound({ pos: nbt.list(3, [nbt.int(0), nbt.int(0), nbt.int(0)]), state: nbt.int(0) }),
            nbt.compound({ pos: nbt.list(3, [nbt.int(1), nbt.int(0), nbt.int(0)]), state: nbt.int(1) }),
          ]),
          entities: nbt.list(10, []),
        },
        "",
      ),
    );
    const ids = details!.blocks.map((block) => block.id).sort();
    expect(ids).toEqual(["minecraft:light_gray_wool", "minecraft:mossy_stone_bricks"]);
    const en = await describeBlocks(instance, ids, "en");
    expect(en["minecraft:mossy_stone_bricks"].name).toBe("Mossy Stone Bricks");
    expect(en["minecraft:mossy_stone_bricks"].icon).not.toBeNull();
  });
});

describe("block models for the 3D view", () => {
  it("picks variants, multipart parts and forge defaults", () => {
    const stairs = {
      variants: {
        "facing=east,half=bottom": { model: "a" },
        "facing=south,half=bottom": { model: "b", y: 90 },
      },
    };
    expect(selectVariants(stairs, { facing: "south", half: "bottom" })[0]).toMatchObject({
      model: "b",
      y: 90,
    });
    expect(selectVariants(stairs, {})[0].model).toBe("a");

    const fence = {
      multipart: [
        { apply: { model: "post" } },
        { when: { north: "true" }, apply: { model: "side" } },
        { when: { OR: [{ east: "true" }, { west: "true" }] }, apply: { model: "cross" } },
      ],
    };
    expect(selectVariants(fence, { north: "true", east: "false", west: "true" }).map((part) => part.model)).toEqual([
      "post",
      "side",
      "cross",
    ]);

    const forge = {
      forge_marker: 1,
      defaults: { model: "oldmod:press", textures: { all: "oldmod:blocks/press" } },
      variants: { normal: [{}], facing: { north: { y: 0 }, east: { y: 90 } } },
    };
    expect(selectVariants(forge, { facing: "east" })[0]).toMatchObject({
      model: "oldmod:press",
      y: 90,
      textures: { all: "oldmod:blocks/press" },
    });
  });

  it("bakes cubes, rotated stairs, water and unknown blocks", async () => {
    const set = await bakeBlockModels(instance, [
      "minecraft:air",
      "minecraft:stone_bricks",
      "minecraft:oak_stairs[facing=south,half=bottom,shape=straight]",
      "minecraft:water[level=0]",
      "mymod:crusher",
      "mymod:ghost",
    ]);
    const [air, bricks, stairs, water, crusher, ghost] = set.blocks;
    expect(set.vanillaSource).toBe("instance");
    expect(air.quads).toHaveLength(0);
    expect(bricks).toMatchObject({ cube: true, liquid: false, missing: false });
    expect(bricks.quads.map((quad) => quad.cull).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(stairs.cube).toBe(false);
    expect(stairs.quads.filter((quad) => quad.cull === 3)).toHaveLength(2);
    expect(water).toMatchObject({ liquid: true, cube: false });
    expect(water.quads.every((quad) => quad.tint === 0x3f76e4)).toBe(true);
    expect(crusher.cube).toBe(true);
    expect(ghost.missing).toBe(true);
    expect(set.textures[ghost.quads[0].texture].color).not.toBeNull();
    expect(set.textures[bricks.quads[0].texture].png?.byteLength).toBeGreaterThan(0);
  });
});

describe("schematic volume", () => {
  it("places 1.12 blocks and joins legacy fences and doors", async () => {
    const file = path.join(hoisted.appData, "fence.schematic");
    await fs.writeFile(
      file,
      writeTestNbt(
        {
          Width: nbt.short(3),
          Height: nbt.short(2),
          Length: nbt.short(1),
          Materials: nbt.string("Alpha"),
          Blocks: nbt.bytes([85, 85, 64, 0, 0, 64]),
          Data: nbt.bytes([0, 0, 2, 0, 0, 8]),
          TileEntities: nbt.list(10, []),
          Entities: nbt.list(10, []),
        },
        "Schematic",
      ),
    );
    const result = await loadSchematicVolume(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { volume } = result;
    expect(volume.size).toEqual({ x: 3, y: 2, z: 1 });
    expect(volume.blocks).toBe(4);
    const at = (x: number, y: number) => volume.palette[volume.data[x + y * 3]];
    expect(at(0, 0)).toBe("minecraft:oak_fence[north=false,south=false,west=false,east=true]");
    expect(at(1, 0)).toBe("minecraft:oak_fence[north=false,south=false,west=true,east=false]");
    expect(at(2, 1)).toBe("minecraft:oak_door[facing=west,half=upper,hinge=left,open=false]");
    expect(at(0, 1)).toBe("minecraft:air");
  });

  it("loads a window of layers", async () => {
    const file = path.join(hoisted.appData, "tower.schem");
    await fs.writeFile(
      file,
      writeTestNbt(
        {
          Version: nbt.int(2),
          DataVersion: nbt.int(3700),
          Width: nbt.short(1),
          Height: nbt.short(4),
          Length: nbt.short(1),
          Palette: nbt.compound({ "minecraft:air": nbt.int(0), "minecraft:stone": nbt.int(1) }),
          BlockData: nbt.bytes([1, 0, 1, 1]),
        },
        "Schematic",
      ),
    );
    const result = await loadSchematicVolume(file, 2);
    expect(result.ok && result.volume).toMatchObject({ yFrom: 2, yTo: 3, blocks: 2 });
  });
});
