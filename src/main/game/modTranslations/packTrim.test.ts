import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZipArchive, readEntryData, withArchive } from "../../utilities/archiver";
import { cleanLangJson, packTrim, writeTrimmedPack } from "./packTrim";

let root: string;

async function zip(name: string, files: Record<string, string>) {
  const target = path.join(root, name);
  await createZipArchive(
    [],
    target,
    undefined,
    6,
    undefined,
    Object.entries(files).map(([entry, data]) => ({ name: entry, data: Buffer.from(data, "utf8") })),
  );
  return target;
}

async function read(file: string): Promise<Record<string, string>> {
  return withArchive(file, async (archive) => {
    const out: Record<string, string> = {};
    for (const entry of archive.getEntries()) {
      if (!entry.isDirectory) out[entry.entryName] = (await readEntryData(entry)).toString("utf8");
    }
    return out;
  });
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-trim-"));
});

afterAll(async () => {
  await fs.remove(root);
});

describe("cleanLangJson", () => {
  it("keeps a file of plain strings byte for byte", () => {
    const data = Buffer.from('{"a.b": "Текст"}', "utf8");
    expect(cleanLangJson(data, false)).toBe(data);
  });

  it("drops values that are not strings unless owo reads rich text", () => {
    const data = Buffer.from('{"a": "x", "b": ["y"], "c": {"text": "z"}}', "utf8");
    expect(JSON.parse(cleanLangJson(data, false)!.toString("utf8"))).toEqual({ a: "x" });
    expect(cleanLangJson(data, true)).toBe(data);
  });

  it("strips a byte order mark and rejects what is not a JSON object", () => {
    expect(cleanLangJson(Buffer.from('\uFEFF{"a": "x"}', "utf8"), false)!.toString("utf8")).toBe('{"a": "x"}');
    expect(cleanLangJson(Buffer.from('{"a": "x",}', "utf8"), false)).toBeNull();
    expect(cleanLangJson(Buffer.from('["a"]', "utf8"), false)).toBeNull();
  });
});

describe("packTrim", () => {
  it("always keeps vanilla, turns on rich text with owo and changes id with the set", () => {
    const plain = packTrim(["Waystones"]);
    expect([...plain.keep].sort()).toEqual(["minecraft", "realms", "waystones"]);
    expect(plain.richText).toBe(false);
    expect(packTrim(["waystones", "owo"]).richText).toBe(true);
    expect(packTrim(["waystones"]).id).toBe(plain.id);
    expect(packTrim(["waystones", "xaerominimap"]).id).not.toBe(plain.id);
  });
});

describe("writeTrimmedPack", () => {
  it("keeps only installed namespaces and repairs their lang files", async () => {
    const source = await zip("source.zip", {
      "pack.mcmeta": '{"pack":{"pack_format":88,"description":"x"}}',
      "pack.png": "png",
      "assets/waystones/lang/ru_ru.json": '{"a": "Путевой камень"}',
      "assets/waystones/textures/gui/menu.png": "png",
      "assets/xaerominimap/lang/ru_ru.json": '{"m": "Карта", "n": ["Во", "н"]}',
      "assets/minecraft/lang/ru_ru.json": '{"v": "Ванилла"}',
      "assets/numismatic-overhaul/lang/ru_ru.json": '{"x": ["array"]}',
      "assets/bibliobiomes/lang/ru_ru.json": '{"broken": "yes",}',
      "assets/bibliobiomes/textures/item/a.png": "png",
    });
    const target = path.join(root, "resourcepacks", "grubie-i18n-mploc-mods.zip");

    const result = await writeTrimmedPack(source, target, packTrim(["waystones", "xaerominimap"]));

    const files = await read(target);
    expect(Object.keys(files).sort()).toEqual([
      "assets/minecraft/lang/ru_ru.json",
      "assets/waystones/lang/ru_ru.json",
      "assets/waystones/textures/gui/menu.png",
      "assets/xaerominimap/lang/ru_ru.json",
      "pack.mcmeta",
      "pack.png",
    ]);
    expect(files["assets/waystones/lang/ru_ru.json"]).toBe('{"a": "Путевой камень"}');
    expect(JSON.parse(files["assets/xaerominimap/lang/ru_ru.json"])).toEqual({ m: "Карта" });
    expect(result).toEqual({ files: 6, dropped: 0, cleaned: 1 });
    expect(await fs.pathExists(`${target}.tmp`)).toBe(false);
    expect(await fs.readdir(root)).not.toContain("grubie-i18n-mploc-mods.zip.tmp");
  });

  it("counts a broken lang file of an installed mod as dropped", async () => {
    const source = await zip("broken.zip", {
      "assets/bibliobiomes/lang/ru_ru.json": '{"broken": "yes",}',
      "assets/bibliobiomes/lang/en_us.lang": "a=b",
    });
    const target = path.join(root, "broken-out.zip");
    const result = await writeTrimmedPack(source, target, packTrim(["bibliobiomes"]));
    expect(Object.keys(await read(target))).toEqual(["assets/bibliobiomes/lang/en_us.lang"]);
    expect(result).toEqual({ files: 1, dropped: 1, cleaned: 0 });
  });
});
