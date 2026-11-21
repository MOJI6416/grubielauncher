import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyInlineRewrite,
  inlineKey,
  readInlineEnglish,
  restoreInline,
  rewriteInline,
} from "./ftbInline";

const CHAPTER = `{
\tdefault_hide_dependency_lines: false
\tfilename: "getting_started"
\ticon: "minecraft:oak_log"
\tid: "0A1B2C3D4E5F6071"
\tquests: [
\t\t{
\t\t\tdescription: [
\t\t\t\t"Welcome to &aDarkRPG&r!"
\t\t\t\t""
\t\t\t\t"{@pagebreak}"
\t\t\t\t"{image:darkrpg:textures/logo.png width:100 height:50 align:center}"
\t\t\t\t"Craft a {item.minecraft.crafting_table} first, 50% done."
\t\t\t\t"[\\"\\", {\\"text\\": \\"JSON line\\"}]"
\t\t\t]
\t\t\tid: "1111111111111111"
\t\t\tsubtitle: "The beginning"
\t\t\ttasks: [{ id: "2222222222222222", item: "minecraft:oak_log", type: "item", count: 4L }]
\t\t\ttitle: "Wood"
\t\t\tx: 0.0d
\t\t}
\t]
\tsubtitle: ["Start here"]
\ttitle: "Getting Started"
}
`;

describe("old FTB Quests chapters", () => {
  it("swaps only player-visible text for keys and keeps every other byte", () => {
    const { text, english } = rewriteInline(CHAPTER);
    expect(Object.values(english).sort()).toEqual(
      [
        "Craft a {item.minecraft.crafting_table} first, 50%% done.",
        "Getting Started",
        "Start here",
        "The beginning",
        "JSON line",
        "Welcome to &aDarkRPG&r!",
        "Wood",
      ].sort(),
    );
    expect(text).toContain(`title: "{${inlineKey("Wood")}}"`);
    expect(text).toContain('"{@pagebreak}"');
    expect(text).toContain('"{image:darkrpg:textures/logo.png width:100 height:50 align:center}"');
    expect(text).toContain('count: 4L');
    expect(text).toContain('id: "1111111111111111"');
    expect(text).toContain('item: "minecraft:oak_log"');
    expect(text).toContain('\\"fallback\\":\\"JSON line\\"');
    const again = rewriteInline(text);
    expect(again.text).toBe(text);
    expect(Object.keys(again.english).every((key) => key.startsWith("grubie.text."))).toBe(true);
  });
});

describe("rewriting an instance's quests", () => {
  let instance: string;
  let storage: string;
  const chapter = () => path.join(instance, "config/ftbquests/quests/chapters/getting_started.snbt");

  beforeEach(async () => {
    instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-ftbq-"));
    storage = path.join(instance, "storage", "mod-translations");
    await fs.outputFile(chapter(), CHAPTER, "utf8");
    await fs.outputFile(path.join(instance, "config/ftbquests/quests/data.snbt"), '{ title: "Quest Book" version: 13 }\n');
  });

  afterEach(async () => {
    await fs.remove(instance);
  });

  it("reads the English before and after the rewrite and restores the files", async () => {
    const english = await readInlineEnglish(instance, storage, []);
    expect(Object.keys(english)).toHaveLength(8);

    const rewritten = await applyInlineRewrite(instance, storage, []);
    expect(rewritten.map((entry) => entry.file).sort()).toEqual([
      "chapters/getting_started.snbt",
      "data.snbt",
    ]);
    expect(await fs.readFile(chapter(), "utf8")).toContain(`"{${inlineKey("Getting Started")}}"`);
    expect(await readInlineEnglish(instance, storage, rewritten)).toEqual(english);
    expect(await applyInlineRewrite(instance, storage, rewritten)).toEqual(rewritten);

    await restoreInline(instance, storage, rewritten);
    expect(await fs.readFile(chapter(), "utf8")).toBe(CHAPTER);
  });

  it("leaves FTB Quests with the lang/ folder to the lang file logic", async () => {
    await fs.outputFile(path.join(instance, "config/ftbquests/quests/lang/en_us.snbt"), "{}");
    expect(await readInlineEnglish(instance, storage, [])).toEqual({});
    expect(await applyInlineRewrite(instance, storage, [])).toEqual([]);
  });
});
