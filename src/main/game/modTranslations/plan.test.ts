import { describe, expect, it } from "vitest";
import type { NamespaceLang } from "./jarScan";
import { parseLangFile, parseLangPath } from "./langFiles";
import {
  chunkBySize,
  modNamespaces,
  planUnits,
  preferPackEnglish,
  splitUnitEntries,
  translationPackFiles,
} from "./plan";
import { needsTranslation, unitHash } from "./unitHash";
import {
  modTranslationLocale,
  supportsModTranslation,
} from "@/types/ModTranslations";

function lang(
  namespace: string,
  english: Record<string, string>,
  translatedKeys: string[] = [],
): NamespaceLang {
  return { namespace, format: "json", english, translatedKeys };
}

describe("unitHash", () => {
  it("matches the api digest", () => {
    expect(unitHash({ "item.mod.gear": "Gear" })).toBe(
      "cba9ac7c7de6e485f6fc3a0119b67e9cf37f98e195c345abd21e9c2d19a143ca",
    );
  });

  it("does not depend on key order", () => {
    expect(unitHash({ b: "2", a: "1" })).toBe(unitHash({ a: "1", b: "2" }));
  });

  it("skips ids, placeholders and numbers", () => {
    expect(needsTranslation("Copper Gear")).toBe(true);
    expect(needsTranslation("%s / %s")).toBe(false);
    expect(needsTranslation("create:brass")).toBe(false);
  });
});

describe("splitUnitEntries", () => {
  const quests = (count: number, text = "Collect the ore and bring it back") =>
    Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`atm9.quest.${index}.description`, text]),
    );

  it("leaves a unit the api accepts in one piece", () => {
    const entries = quests(6000);
    expect(splitUnitEntries(entries)).toEqual([entries]);
  });

  it("splits a namespace over the api limits into stable parts that fit them", () => {
    const entries = quests(7248, "x".repeat(88));
    const parts = splitUnitEntries(entries);
    expect(parts.length).toBe(3);
    expect(parts.flatMap((part) => Object.keys(part)).sort()).toEqual(Object.keys(entries).sort());
    for (const part of parts) {
      expect(Object.keys(part).length).toBeLessThanOrEqual(6000);
      expect(Object.values(part).join("").length).toBeLessThanOrEqual(400_000);
    }

    const grown = { ...entries, "atm9.quest.new.title": "x".repeat(88) };
    const changed = splitUnitEntries(grown).filter(
      (part) => !parts.some((old) => unitHash(old) === unitHash(part)),
    );
    expect(changed).toHaveLength(1);
  });

  it("gives each part of a big namespace its own planned unit", () => {
    const units = planUnits([[lang("kubejs", quests(7248, "x".repeat(88)))]], new Set());
    expect(units.map((unit) => unit.namespace)).toEqual(["kubejs", "kubejs", "kubejs"]);
    expect(units.reduce((sum, unit) => sum + Object.keys(unit.entries).length, 0)).toBe(7248);
  });
});

describe("planUnits", () => {
  it("leaves out what the mod, another jar or a pack already translates", () => {
    const jars = [
      [
        lang(
          "create",
          {
            "item.create.gear": "Cogwheel",
            "item.create.belt": "Mechanical Belt",
            "item.create.count": "%s",
            "item.create.shared": "Wrench",
          },
          ["item.create.belt"],
        ),
      ],
      [lang("addon", { "item.addon.drill": "Drill" }, ["item.create.shared"])],
    ];

    const units = planUnits(jars, new Set(["item.addon.drill"]));

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      namespace: "create",
      entries: { "item.create.gear": "Cogwheel" },
    });
    expect(units[0].hash).toBe(unitHash({ "item.create.gear": "Cogwheel" }));
  });

  it("never plans vanilla's namespace and merges identical units", () => {
    const same = { "item.lib.core": "Core" };
    const units = planUnits(
      [
        [lang("minecraft", { "block.minecraft.stone": "Stone" })],
        [lang("lib", same)],
        [lang("lib", same)],
      ],
      new Set(),
    );
    expect(units.map((unit) => unit.namespace)).toEqual(["lib"]);
    expect(modNamespaces([[lang("minecraft", {})], [lang("lib", same)]])).toEqual([
      "lib",
    ]);
  });
});

describe("preferPackEnglish", () => {
  it("translates the English a modpack's pack shows instead of the jar's", () => {
    const jar = lang("lumymon", {
      "welcome.lumymon.title": "COBBLEVERSE 1.7.40",
      "welcome.lumymon.other": "Kept",
    });
    const pack = {
      ...lang("cobbleverse", { "welcome.lumymon.title": "COBBLEVERSE 1.8.0" }),
      origin: "pack" as const,
    };

    const [jars, packs] = preferPackEnglish([[jar], [pack]]);
    expect(jars[0].english).toEqual({ "welcome.lumymon.other": "Kept" });
    expect(packs[0]).toBe(pack);
    expect(
      planUnits([jars, packs], new Set()).flatMap((unit) => Object.values(unit.entries)),
    ).toEqual(expect.arrayContaining(["Kept", "COBBLEVERSE 1.8.0"]));
  });
});

describe("translationPackFiles", () => {
  it("writes one sorted JSON file per namespace for modern versions", () => {
    const files = translationPackFiles(
      [
        { namespace: "create", entries: { b: "Б" } },
        { namespace: "addon", entries: { a: "А" } },
        { namespace: "create", entries: { a: "А" } },
      ],
      "ru_ru",
      "1.20.1",
      "json",
    );

    expect(files.map((file) => file.name)).toEqual([
      "assets/addon/lang/ru_ru.json",
      "assets/create/lang/ru_ru.json",
    ]);
    expect(parseLangFile("json", files[1].data)).toEqual({ a: "А", b: "Б" });
    expect(parseLangPath(files[0].name)?.locale).toBe("ru_ru");
  });

  it("writes .lang files with escaped line breaks for 1.12 and en_US case for 1.7", () => {
    const [modern] = translationPackFiles(
      [{ namespace: "thermal", entries: { "tile.x.name": "Строка\nдве" } }],
      "ru_ru",
      "1.12.2",
      "lang",
    );
    expect(modern.name).toBe("assets/thermal/lang/ru_ru.lang");
    expect(modern.data.toString("utf8")).toBe("tile.x.name=Строка\\nдве\n");

    const [legacy] = translationPackFiles(
      [{ namespace: "ic2", entries: { k: "в" } }],
      "uk_ua",
      "1.7.10",
      "lang",
    );
    expect(legacy.name).toBe("assets/ic2/lang/uk_UA.lang");
  });
});

describe("chunkBySize", () => {
  it("respects both limits and keeps every item", () => {
    const batches = chunkBySize([5, 5, 5, 20, 1], 2, 12, (n) => n);
    expect(batches).toEqual([[5, 5], [5], [20], [1]]);
  });
});

describe("languages and versions", () => {
  it("maps launcher languages to game locales", () => {
    expect(modTranslationLocale("ru")).toBe("ru_ru");
    expect(modTranslationLocale("uk")).toBe("uk_ua");
    expect(modTranslationLocale("en")).toBeNull();
    expect(modTranslationLocale("de")).toBeNull();
  });

  it.each([
    ["1.20.1", true],
    ["1.12.2", true],
    ["1.6.4", true],
    ["1.5.2", false],
    ["b1.7.3", false],
    ["26.1", true],
    ["24w14a", true],
  ])("%s supported: %s", (version, expected) => {
    expect(supportsModTranslation(version)).toBe(expected);
  });
});
