import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZipArchive } from "../../utilities/archiver";
import { scanJarLang, scanPackKeys } from "./jarScan";

let root: string;

async function zip(name: string, files: Record<string, string | Buffer>) {
  const target = path.join(root, name);
  await createZipArchive(
    [],
    target,
    undefined,
    6,
    undefined,
    Object.entries(files).map(([entry, data]) => ({
      name: entry,
      data: Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"),
    })),
  );
  return target;
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-i18n-"));
});

afterAll(async () => {
  await fs.remove(root);
});

describe("scanJarLang", () => {
  it("reads English and the target keys, nested jars included", async () => {
    const inner = await fs.readFile(
      await zip("inner.jar", {
        "assets/fabric-lib/lang/en_us.json": '{"lib.key":"Library"}',
      }),
    );
    const jar = await zip("mod.jar", {
      "assets/create/lang/en_us.json":
        '{"item.create.gear":"Cogwheel","item.create.belt":"Belt"}',
      "assets/create/lang/ru_ru.json": '{"item.create.belt":"Лента"}',
      "assets/create/lang/de_de.json": '{"item.create.gear":"Zahnrad"}',
      "assets/onlyru/lang/ru_ru.json": '{"x":"y"}',
      "META-INF/jars/fabric-lib.jar": inner,
      "data/create/recipes/gear.json": "{}",
    });

    const result = await scanJarLang(jar, "ru_ru");

    expect(result).toEqual([
      {
        namespace: "create",
        format: "json",
        english: { "item.create.gear": "Cogwheel", "item.create.belt": "Belt" },
        translatedKeys: ["item.create.belt"],
      },
      {
        namespace: "fabric-lib",
        format: "json",
        english: { "lib.key": "Library" },
        translatedKeys: [],
      },
    ]);
  });

  it("reads legacy .lang files", async () => {
    const jar = await zip("legacy.jar", {
      "assets/thermal/lang/en_US.lang": "tile.machine.name=Machine\n# c\n",
      "assets/thermal/lang/ru_RU.lang": "tile.other.name=Другое\n",
    });

    expect(await scanJarLang(jar, "ru_ru")).toEqual([
      {
        namespace: "thermal",
        format: "lang",
        english: { "tile.machine.name": "Machine" },
        translatedKeys: ["tile.other.name"],
      },
    ]);
  });

  it("survives a broken lang file", async () => {
    const jar = await zip("broken.jar", {
      "assets/bad/lang/en_us.json": "{oops",
      "assets/good/lang/en_us.json": '{"k":"Value"}',
    });
    expect((await scanJarLang(jar, "ru_ru")).map((n) => n.namespace)).toEqual([
      "good",
    ]);
  });
});

describe("scanPackKeys", () => {
  it("collects every key a pack translates into the locale", async () => {
    const pack = await zip("pack.zip", {
      "pack.mcmeta": '{"pack":{"pack_format":15}}',
      "assets/create/lang/ru_ru.json": '{"a":"1","b":"2"}',
      "assets/jei/lang/ru_ru.json": '{"c":"3"}',
      "assets/jei/lang/uk_ua.json": '{"d":"4"}',
    });

    expect([...(await scanPackKeys(pack, "ru_ru"))].sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
