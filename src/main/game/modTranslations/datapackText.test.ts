import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZipArchive } from "../../utilities/archiver";
import { componentKey } from "./components";
import {
  applyDataRewrite,
  listDataPacks,
  restoreDataRewrite,
  scanDataPacks,
} from "./datapackText";
import { readZipFiles } from "./jarScan";

let instance: string;
let storage: string;

const ADVANCEMENT = JSON.stringify({
  display: {
    icon: { id: "minecraft:stone" },
    title: "Getting Started",
    description: { text: "Pick up rocks from the ground", color: "gray" },
  },
  criteria: {},
});
const FUNCTION = [
  'tellraw @a {"text":"Welcome, traveller!","color":"gold"}',
  'execute as @a run title @s actionbar ["",{"text":"Day "},{"score":{"name":"@s","objective":"days"}}]',
  "say not touched",
  "",
].join("\n");

async function write(relative: string, data: string) {
  await fs.outputFile(path.join(instance, ...relative.split("/")), data, "utf8");
}

beforeAll(async () => {
  instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-data-"));
  storage = path.join(instance, "storage", "mod-translations");
  await write("config/paxi/datapacks/welcome/pack.mcmeta", "{}");
  await write("config/paxi/datapacks/welcome/data/aged/advancements/start.json", ADVANCEMENT);
  await write("config/paxi/datapacks/welcome/data/aged/functions/hello.mcfunction", FUNCTION);
  await write("config/paxi/datapacks/empty/readme.txt", "no data here");
  await createZipArchive([], path.join(instance, "datapacks", "Extra.zip"), undefined, 6, undefined, [
    { name: "pack.mcmeta", data: Buffer.from("{}") },
    { name: "data/extra/advancement/boss.json", data: Buffer.from(JSON.stringify({ display: { title: "Boss Slayer", description: "Defeat the boss" } })) },
  ]);
});

afterAll(async () => {
  await fs.remove(instance);
});

describe("datapack text", () => {
  it("finds the modpack's data packs and their texts", async () => {
    const packs = await listDataPacks(instance);
    expect(packs.map((pack) => [pack.id, pack.zip])).toEqual([
      ["config/paxi/datapacks/welcome", false],
      ["datapacks/Extra.zip", true],
    ]);
    const langs = await scanDataPacks(packs);
    expect(langs.map((lang) => [lang.context?.name, Object.values(lang.english).sort()])).toEqual([
      ["welcome", ["Day %1$s", "Getting Started", "Pick up rocks from the ground", "Welcome, traveller!"]],
      ["Extra", ["Boss Slayer", "Defeat the boss"]],
    ]);
  });

  it("rewrites texts into translatable ones once and puts the originals back", async () => {
    const packs = await listDataPacks(instance);
    const first = await applyDataRewrite(storage, packs, []);
    expect(first.map((entry) => entry.file).sort()).toEqual([
      "config/paxi/datapacks/welcome/data/aged/advancements/start.json",
      "config/paxi/datapacks/welcome/data/aged/functions/hello.mcfunction",
      "datapacks/Extra.zip",
    ]);

    const advancement = await fs.readJSON(
      path.join(instance, "config/paxi/datapacks/welcome/data/aged/advancements/start.json"),
    );
    expect(advancement.display.title).toEqual({
      translate: componentKey("Getting Started"),
      fallback: "Getting Started",
    });
    expect(advancement.display.description).toMatchObject({ color: "gray", fallback: "Pick up rocks from the ground" });
    expect(advancement.display.icon).toEqual({ id: "minecraft:stone" });

    const lines = (
      await fs.readFile(path.join(instance, "config/paxi/datapacks/welcome/data/aged/functions/hello.mcfunction"), "utf8")
    ).split("\n");
    expect(JSON.parse(lines[0].slice("tellraw @a ".length))).toEqual({
      color: "gold",
      translate: componentKey("Welcome, traveller!"),
      fallback: "Welcome, traveller!",
    });
    expect(lines[1]).toContain('"with":[{"score":{"name":"@s","objective":"days"}}]');
    expect(lines[2]).toBe("say not touched");

    const zipped = await readZipFiles(path.join(instance, "datapacks", "Extra.zip"), 1 << 20);
    const boss = JSON.parse(zipped!.find((file) => file.name.endsWith("boss.json"))!.data.toString("utf8"));
    expect(boss.display.title.fallback).toBe("Boss Slayer");

    const second = await applyDataRewrite(storage, packs, first);
    expect(second).toEqual(first);
    expect((await scanDataPacks(packs)).map((lang) => Object.keys(lang.english).length)).toEqual([4, 2]);

    await restoreDataRewrite(instance, storage, second);
    expect(
      await fs.readFile(path.join(instance, "config/paxi/datapacks/welcome/data/aged/functions/hello.mcfunction"), "utf8"),
    ).toBe(FUNCTION);
    expect(
      await fs.readFile(path.join(instance, "config/paxi/datapacks/welcome/data/aged/advancements/start.json"), "utf8"),
    ).toBe(ADVANCEMENT);
    const restored = await readZipFiles(path.join(instance, "datapacks", "Extra.zip"), 1 << 20);
    expect(JSON.parse(restored!.find((file) => file.name.endsWith("boss.json"))!.data.toString("utf8")).display.title).toBe(
      "Boss Slayer",
    );
  });
});
