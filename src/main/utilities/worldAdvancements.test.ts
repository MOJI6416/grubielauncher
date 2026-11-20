import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "path";

const hoisted = vi.hoisted(() => {
  const root = process.env.TEMP || process.env.TMPDIR || "/tmp";
  return { base: `${root}/grubie-advancements-${process.pid}-${Date.now()}` };
});

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.base },
  shell: { trashItem: async () => undefined },
}));

import { TestZip } from "./testZip";
import { generateCanonicalOfflineUUID, toUUID } from "./other";
import {
  advancementIdOf,
  loadWorldAdvancements,
  parseAdvancementProgress,
} from "./worldAdvancements";

const versionPath = path.join(hoisted.base, "versions", "Pack");
const worldPath = path.join(versionPath, "saves", "Quest World");
const account = { nickname: "Steve" } as never;

const shown = (title: string) =>
  Buffer.from(JSON.stringify({ display: { title }, criteria: {} }));
const hidden = Buffer.from(JSON.stringify({ criteria: {} }));

async function writeZip(target: string, files: Record<string, Buffer>) {
  const zip = new TestZip();
  for (const [name, data] of Object.entries(files)) zip.addFile(name, data);
  await fs.outputFile(target, zip.toBuffer());
}

beforeAll(async () => {
  await writeZip(path.join(versionPath, "1.21.1.jar"), {
    "data/minecraft/advancement/story/root.json": shown("Minecraft"),
    "data/minecraft/advancement/story/mine_stone.json": shown("Stone Age"),
    "data/minecraft/advancement/story/smelt_iron.json": shown("Acquire Hardware"),
    "data/minecraft/advancement/adventure/root.json": shown("Adventure"),
    "data/minecraft/advancement/recipes/misc/stick.json": shown("never"),
    "data/minecraft/advancement/technical.json": hidden,
    "assets/minecraft/textures/block/stone.png": Buffer.from("png"),
  });

  await writeZip(path.join(versionPath, "mods", "create-1.20.1.jar"), {
    "data/create/advancements/root.json": shown("Create"),
    "data/create/advancements/andesite_alloy.json": shown("Alloy"),
    "data/create/advancements/recipes/misc/cog.json": shown("never"),
  });
  await writeZip(path.join(versionPath, "mods", "old.jar.disabled"), {
    "data/old/advancements/root.json": shown("Old"),
  });
  await writeZip(path.join(versionPath, "mods", "legacy-1.12.jar"), {
    "assets/legacy/advancements/root.json": shown("Legacy"),
  });

  await fs.outputFile(
    path.join(
      worldPath,
      "datapacks",
      "quests",
      "data",
      "quests",
      "advancement",
      "chapter_1.json",
    ),
    shown("Chapter 1"),
  );
  await fs.outputFile(
    path.join(
      worldPath,
      "datapacks",
      "quests",
      "data",
      "minecraft",
      "advancement",
      "adventure",
      "root.json",
    ),
    hidden,
  );
  await writeZip(path.join(worldPath, "datapacks", "off.zip"), {
    "data/off/advancement/root.json": shown("Off"),
  });

  const uuid = toUUID(generateCanonicalOfflineUUID("Steve"));
  await fs.outputJson(
    path.join(worldPath, "players", "advancements", `${uuid}.json`),
    {
      "minecraft:story/root": { criteria: {}, done: true },
      "minecraft:story/mine_stone": { criteria: {}, done: true },
      "minecraft:story/smelt_iron": { criteria: {}, done: false },
      "minecraft:recipes/misc/stick": { criteria: {}, done: true },
      "create:root": { criteria: {}, done: true },
      "quests:chapter_1": { criteria: {}, done: true },
      "removedmod:root": { criteria: {}, done: true },
      DataVersion: 3955,
    },
  );
});

afterAll(async () => {
  await fs.remove(hoisted.base).catch(() => undefined);
});

describe("advancement ids", () => {
  it("reads both folder spellings and skips recipes", () => {
    expect(advancementIdOf("data/minecraft/advancement/story/root.json")).toBe(
      "minecraft:story/root",
    );
    expect(advancementIdOf("data/create/advancements/root.json")).toBe(
      "create:root",
    );
    expect(advancementIdOf("assets/legacy/advancements/a/b.json")).toBe(
      "legacy:a/b",
    );
    expect(
      advancementIdOf("data/minecraft/advancement/recipes/misc/stick.json"),
    ).toBeNull();
    expect(advancementIdOf("data/minecraft/loot_table/a.json")).toBeNull();
  });

  it("keeps only finished advancements from the player file", () => {
    expect(
      [
        ...parseAdvancementProgress(
          '﻿{"a:b":{"done":true},"a:c":{"done":false},"DataVersion":1}',
        ),
      ],
    ).toEqual(["a:b"]);
    expect(parseAdvancementProgress("not json").size).toBe(0);
  });
});

describe("world advancement progress", () => {
  it("adds up the game, enabled mods and enabled datapacks", async () => {
    const result = await loadWorldAdvancements(
      versionPath,
      worldPath,
      account,
      "1.21.1",
      ["vanilla", "file/off.zip"],
    );

    expect(result).toMatchObject({ done: 4, total: 7, hasProgress: true });
    expect(result?.groups).toEqual([
      {
        namespace: "minecraft",
        source: "game",
        file: null,
        done: 2,
        total: 3,
      },
      {
        namespace: "create",
        source: "mod",
        file: "create-1.20.1.jar",
        done: 1,
        total: 2,
      },
      {
        namespace: "quests",
        source: "datapack",
        file: "quests",
        done: 1,
        total: 1,
      },
      {
        namespace: "legacy",
        source: "mod",
        file: "legacy-1.12.jar",
        done: 0,
        total: 1,
      },
    ]);
  });

  it("shows the totals before the player has a progress file", async () => {
    const result = await loadWorldAdvancements(
      versionPath,
      worldPath,
      { nickname: "Alex" } as never,
      "1.21.1",
    );

    expect(result).toMatchObject({ done: 0, total: 8, hasProgress: false });
  });

  it("returns nothing for versions without advancements", async () => {
    expect(
      await loadWorldAdvancements(
        path.join(hoisted.base, "versions", "Empty"),
        path.join(hoisted.base, "versions", "Empty", "saves", "W"),
        account,
        "1.7.10",
      ),
    ).toBeNull();
  });
});
