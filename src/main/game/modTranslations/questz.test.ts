import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyQuestzRewrite,
  chapterEnglish,
  questzNamespace,
  readQuestzChapters,
  restoreQuestz,
  rewriteChapter,
} from "./questz";

const CHAPTER = {
  line_style: "orthogonal",
  id: "start",
  title: "First Steps",
  quests: [
    { id: "091167fb", title: "Start", tasks: [{ id: "1", type: "questz:criterion" }] },
    {
      id: "6db07bbe",
      title: "Pick rocks",
      description: ["Gather rocks from the ground", "", "%s"],
      icon: { id: "earlystage:rock" },
    },
    { id: "keyed", title: { translate: "quest.author.key" }, description: "Single line text" },
  ],
};

describe("QuestZ chapters", () => {
  it("collects chapter and quest texts under stable keys", () => {
    expect(chapterEnglish(CHAPTER, "76a9fc9e")).toEqual({
      "grubie.questz.start.title": "First Steps",
      "grubie.questz.start.091167fb.title": "Start",
      "grubie.questz.start.6db07bbe.title": "Pick rocks",
      "grubie.questz.start.6db07bbe.description.0": "Gather rocks from the ground",
      "grubie.questz.start.keyed.description": "Single line text",
    });
  });

  it("turns literal texts into translatable ones that fall back to the English", () => {
    const rewritten = rewriteChapter(CHAPTER, "76a9fc9e") as typeof CHAPTER & Record<string, any>;
    expect(rewritten.title).toEqual({ translate: "grubie.questz.start.title", fallback: "First Steps" });
    expect(rewritten.quests[1].description).toEqual([
      {
        translate: "grubie.questz.start.6db07bbe.description.0",
        fallback: "Gather rocks from the ground",
      },
      "",
      "%s",
    ]);
    expect(rewritten.quests[2].title).toEqual({ translate: "quest.author.key" });
    expect(rewritten.quests[1].icon).toEqual({ id: "earlystage:rock" });
    expect(chapterEnglish(rewritten, "76a9fc9e")).toEqual(chapterEnglish(CHAPTER, "76a9fc9e"));
    expect(CHAPTER.title).toBe("First Steps");
  });

  it("names the chapter by its file when it has no id", () => {
    expect(Object.keys(chapterEnglish({ title: "Main" }, "76A9FC9E"))).toEqual([
      "grubie.questz.76a9fc9e.title",
    ]);
  });
});

describe("rewriting the instance's chapters", () => {
  let instance: string;
  let storage: string;
  const file = () => path.join(instance, "questz", "chapters", "76a9fc9e.json");
  const original = `${JSON.stringify(CHAPTER)}\n`;

  beforeEach(async () => {
    instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-questz-"));
    storage = path.join(instance, "storage", "mod-translations");
    await fs.outputFile(file(), original, "utf8");
  });

  afterEach(async () => {
    await fs.remove(instance);
  });

  it("rewrites once, keeps the original and puts it back", async () => {
    const chapters = await readQuestzChapters(instance);
    expect(questzNamespace(chapters)).toMatchObject({
      namespace: "questz",
      context: { name: "QuestZ" },
    });

    const first = await applyQuestzRewrite(instance, storage, []);
    const rewritten = await fs.readFile(file(), "utf8");
    expect(rewritten).toContain('"translate": "grubie.questz.start.title"');
    expect(await fs.readFile(path.join(storage, "questz-originals", "76a9fc9e.json"), "utf8")).toBe(original);

    const second = await applyQuestzRewrite(instance, storage, first);
    expect(second).toEqual(first);
    expect(await fs.readFile(file(), "utf8")).toBe(rewritten);
    expect(questzNamespace(await readQuestzChapters(instance))?.english).toEqual(
      questzNamespace(chapters)?.english,
    );

    await restoreQuestz(instance, storage, second);
    expect(await fs.readFile(file(), "utf8")).toBe(original);
    expect(await fs.pathExists(path.join(storage, "questz-originals", "76a9fc9e.json"))).toBe(false);
  });

  it("takes a chapter the modpack update replaced as the new original", async () => {
    const first = await applyQuestzRewrite(instance, storage, []);
    const updated = JSON.stringify({ ...CHAPTER, title: "New Beginnings" });
    await fs.writeFile(file(), updated, "utf8");

    const second = await applyQuestzRewrite(instance, storage, first);
    expect(await fs.readFile(file(), "utf8")).toContain('"fallback": "New Beginnings"');
    await restoreQuestz(instance, storage, second);
    expect(await fs.readFile(file(), "utf8")).toBe(updated);
  });

  it("leaves a chapter someone changed after us alone", async () => {
    const first = await applyQuestzRewrite(instance, storage, []);
    await fs.writeFile(file(), '{"title":"Edited by hand"}', "utf8");
    await restoreQuestz(instance, storage, first);
    expect(await fs.readFile(file(), "utf8")).toBe('{"title":"Edited by hand"}');
  });
});
