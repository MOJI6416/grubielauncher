import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZipArchive } from "../../utilities/archiver";
import { scanPackCoverage, scanSource } from "./jarScan";

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

async function folder(name: string, files: Record<string, string>) {
  const target = path.join(root, name);
  for (const [entry, data] of Object.entries(files)) {
    await fs.outputFile(path.join(target, ...entry.split("/")), data, "utf8");
  }
  return target;
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-i18n-"));
});

afterAll(async () => {
  await fs.remove(root);
});

describe("scanSource", () => {
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

    const result = await scanSource(jar, "ru_ru");

    expect(result.namespaces).toEqual([
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
    expect(result.context).toBeNull();
  });

  it("reads legacy .lang files", async () => {
    const jar = await zip("legacy.jar", {
      "assets/thermal/lang/en_US.lang": "tile.machine.name=Machine\n# c\n",
      "assets/thermal/lang/ru_RU.lang": "tile.other.name=Другое\n",
    });

    expect((await scanSource(jar, "ru_ru")).namespaces).toEqual([
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
    expect(
      (await scanSource(jar, "ru_ru")).namespaces.map((n) => n.namespace),
    ).toEqual(["good"]);
  });

  it("reads the mod name and description from fabric.mod.json", async () => {
    const jar = await zip("fabric.jar", {
      "fabric.mod.json": JSON.stringify({
        schemaVersion: 1,
        id: "farmersdelight",
        name: "Farmer's Delight",
        description: "A gentle expansion\nabout cooking and farming.",
      }),
      "assets/farmersdelight/lang/en_us.json": '{"item.fd.knife":"Knife"}',
    });

    const result = await scanSource(jar, "ru_ru");

    const context = {
      name: "Farmer's Delight",
      description: "A gentle expansion about cooking and farming.",
    };
    expect(result.context).toEqual(context);
    expect(result.namespaces[0].context).toEqual(context);
  });

  it("reads the mod name and description from mods.toml", async () => {
    const jar = await zip("forge.jar", {
      "META-INF/mods.toml": [
        'modLoader="javafml"',
        'loaderVersion="[47,)"',
        "[[mods]]",
        'modId="create"',
        'version="${file.jarVersion}"',
        'displayName="Create"',
        "description='''",
        "Technology that empowers",
        "  the player.'''",
        "[[dependencies.create]]",
        'modId="forge"',
        'displayName="Not this one"',
      ].join("\n"),
      "assets/create/lang/en_us.json": '{"item.create.gear":"Cogwheel"}',
    });

    expect((await scanSource(jar, "ru_ru")).context).toEqual({
      name: "Create",
      description: "Technology that empowers the player.",
    });
  });

  it("reads the mod name and description from mcmod.info and cuts it", async () => {
    const jar = await zip("legacy-info.jar", {
      "mcmod.info": JSON.stringify([
        {
          modid: "thermalexpansion",
          name: "Thermal Expansion",
          description: "§6Machines§r. " + "Very long text. ".repeat(40),
        },
      ]),
      "assets/thermalexpansion/lang/en_US.lang": "tile.machine.name=Machine\n",
    });

    const context = (await scanSource(jar, "ru_ru")).context!;
    expect(context.name).toBe("Thermal Expansion");
    expect(context.description!.startsWith("Machines. Very long text.")).toBe(true);
    expect(context.description!.length).toBeLessThanOrEqual(300);
    expect(context.description!.endsWith("…")).toBe(true);
  });

  it("never names a mod after its jar's pack.mcmeta", async () => {
    const jar = await zip("template.jar", {
      "pack.mcmeta": '{"pack":{"pack_format":15,"description":"Example Mod"}}',
      "META-INF/mods.toml": "[[mods]]\nmodId='x'\ndescription='''${file.desc}'''",
      "assets/physicsmod/lang/en_us.json": '{"k":"Value"}',
    });
    const result = await scanSource(jar, "ru_ru");
    expect(result.context).toEqual({ name: "x" });

    const bare = await zip("bare.jar", {
      "pack.mcmeta": '{"pack":{"pack_format":15,"description":"examplemod resources"}}',
      "assets/bare/lang/en_us.json": '{"k":"Value"}',
    });
    expect((await scanSource(bare, "ru_ru")).context).toBeNull();
  });

  it("keeps the nested jar's own name for its namespaces", async () => {
    const inner = await fs.readFile(
      await zip("lib-inner.jar", {
        "fabric.mod.json": '{"id":"lib","name":"Some Library"}',
        "assets/somelib/lang/en_us.json": '{"lib.key":"Library"}',
      }),
    );
    const jar = await zip("outer.jar", {
      "fabric.mod.json": '{"id":"outer","name":"Outer Mod"}',
      "assets/outer/lang/en_us.json": '{"o.key":"Outer"}',
      "META-INF/jars/lib.jar": inner,
    });

    const byNamespace = Object.fromEntries(
      (await scanSource(jar, "ru_ru")).namespaces.map((n) => [
        n.namespace,
        n.context?.name,
      ]),
    );
    expect(byNamespace).toEqual({ outer: "Outer Mod", somelib: "Some Library" });
  });

  it("collects Lavender and Patchouli books and what is already translated", async () => {
    const jar = await zip("books.jar", {
      "assets/aged/lavender/entries/guide/basics/water.md": "Drink water.",
      "assets/aged/lavender/entries/guide/en_us/basics/water.md": "Old copy.",
      "assets/aged/lavender/entries/guide/ru_ru/basics/fire.md": "Огонь.",
      "assets/aged/lavender/entries/guide/basics/fire.md": "Make fire.",
      "assets/tome/patchouli_books/lexicon/en_us/entries/intro.json":
        '{"name":"Intro","pages":["Hello"]}',
      "assets/tome/patchouli_books/lexicon/de_de/entries/intro.json":
        '{"name":"Einführung"}',
      "data/tome/patchouli_books/lexicon/book.json": '{"name":"Lexicon"}',
      "data/keys/patchouli_books/codex/book.json": '{"i18n":true}',
    });

    const result = await scanSource(jar, "ru_ru");

    expect(
      result.books.map((doc) => [doc.format, doc.namespace, doc.book, doc.path, doc.text]),
    ).toEqual([
      ["lavender", "aged", "guide", "basics/fire.md", "Make fire."],
      ["lavender", "aged", "guide", "basics/water.md", "Drink water."],
      ["patchouli", "tome", "lexicon", "intro.json", '{"name":"Intro","pages":["Hello"]}'],
    ]);
    expect(result.translatedDocs).toEqual([
      "lavender:aged:guide:entries/basics/fire.md",
    ]);
    expect(result.patchouliI18n).toEqual(["patchouli:keys:codex"]);
  });

  it("reads a resource pack folder with its name from pack.mcmeta", async () => {
    const pack = await folder("guide_book", {
      "pack.mcmeta": '{"pack":{"pack_format":34,"description":"Aged Guide Book"}}',
      "assets/agedaddition/lang/en_us.json": '{"structure.a":"Smelter"}',
      "assets/agedaddition/lavender/books/guide_book.json": "{}",
      "assets/agedaddition/lavender/categories/guide_book/basics.md": "Basics.",
      "config/ignored.txt": "x",
    });

    const result = await scanSource(pack, "ru_ru");

    expect(result.context).toEqual({ name: "Aged Guide Book" });
    expect(result.namespaces.map((n) => [n.namespace, n.context?.name])).toEqual([
      ["agedaddition", "Aged Guide Book"],
    ]);
    expect(result.books.map((doc) => `${doc.part}/${doc.path}`)).toEqual([
      "categories/basics.md",
    ]);
  });
});

describe("ResourceLoader folders", () => {
  it("reads resources/<namespace>/lang as assets", async () => {
    const root = await folder("resources", {
      "betterquesting/lang/en_us.lang": "betterquesting.quest.1=Chop a tree\n",
      "betterquesting/lang/ru_ru.lang": "betterquesting.quest.2=Есть\n",
    });
    const result = await scanSource(root, "ru_ru", true);
    expect(result.namespaces).toEqual([
      {
        namespace: "betterquesting",
        format: "lang",
        english: { "betterquesting.quest.1": "Chop a tree" },
        translatedKeys: ["betterquesting.quest.2"],
      },
    ]);
  });
});

describe("scanPackCoverage", () => {
  it("collects every key and book page a pack translates into the locale", async () => {
    const pack = await zip("pack.zip", {
      "pack.mcmeta": '{"pack":{"pack_format":15}}',
      "assets/create/lang/ru_ru.json": '{"a":"1","b":"2"}',
      "assets/jei/lang/ru_ru.json": '{"c":"3"}',
      "assets/jei/lang/uk_ua.json": '{"d":"4"}',
      "assets/tome/patchouli_books/lexicon/ru_ru/entries/intro.json": "{}",
      "assets/tome/patchouli_books/lexicon/uk_ua/entries/other.json": "{}",
    });

    const coverage = await scanPackCoverage(pack, "ru_ru");
    expect([...coverage.keys].sort()).toEqual(["a", "b", "c"]);
    expect([...coverage.docs]).toEqual([
      "patchouli:tome:lexicon:entries/intro.json",
    ]);
  });
});
