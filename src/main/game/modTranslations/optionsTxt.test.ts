import { describe, expect, it } from "vitest";
import {
  applyTranslationOptions,
  gameResourceFormat,
  legacyPackFormat,
  packSupportsGame,
  packMcmeta,
  readOptionList,
} from "./optionsTxt";

const AI = "grubie-i18n-ai-ru_ru.zip";
const RTF = "grubie-i18n-rtf-extension.zip";

describe("applyTranslationOptions", () => {
  it("puts our packs above the built-in ones and below the player's", () => {
    const source = [
      "version:3465",
      'resourcePacks:["vanilla","fabric","file/Faithful.zip","file/MyRussian.zip"]',
      "incompatibleResourcePacks:[]",
      "lang:ru_ru",
      "",
    ].join("\n");

    const { text, changed } = applyTranslationOptions(source, {
      mcVersion: "1.20.1",
      packFiles: [AI, RTF],
      incompatibleFiles: [RTF],
      locale: "ru_ru",
    });

    expect(changed).toBe(true);
    expect(readOptionList(text, "resourcePacks")).toEqual([
      "vanilla",
      "fabric",
      `file/${AI}`,
      `file/${RTF}`,
      "file/Faithful.zip",
      "file/MyRussian.zip",
    ]);
    expect(readOptionList(text, "incompatibleResourcePacks")).toEqual([
      `file/${RTF}`,
    ]);
    expect(text.split("\n")[0]).toBe("version:3465");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("moves our packs back under the player's if they ended up on top", () => {
    const source = `resourcePacks:["vanilla","mod_resources","file/Faithful.zip","file/${RTF}"]\nincompatibleResourcePacks:["file/old.zip","file/${RTF}"]\n`;

    const { text } = applyTranslationOptions(source, {
      mcVersion: "1.20.1",
      packFiles: [RTF],
      incompatibleFiles: [RTF],
      locale: null,
    });

    expect(readOptionList(text, "resourcePacks")).toEqual([
      "vanilla",
      "mod_resources",
      `file/${RTF}`,
      "file/Faithful.zip",
    ]);
    expect(readOptionList(text, "incompatibleResourcePacks")).toEqual([
      "file/old.zip",
      `file/${RTF}`,
    ]);
  });

  it("removes only our packs when there is nothing to install", () => {
    const source = `resourcePacks:["vanilla","file/${AI}","file/Faithful.zip"]\nincompatibleResourcePacks:["file/${AI}"]\n`;

    const { text } = applyTranslationOptions(source, {
      mcVersion: "1.20.1",
      packFiles: [],
      incompatibleFiles: [],
      locale: null,
    });

    expect(readOptionList(text, "resourcePacks")).toEqual([
      "vanilla",
      "file/Faithful.zip",
    ]);
    expect(readOptionList(text, "incompatibleResourcePacks")).toEqual([]);
  });

  it("is a no-op when everything is already in place", () => {
    const source = `resourcePacks:["vanilla","file/${AI}"]\nincompatibleResourcePacks:["file/${AI}"]\nlang:ru_ru\n`;

    expect(
      applyTranslationOptions(source, {
        mcVersion: "1.21.1",
        packFiles: [AI],
        incompatibleFiles: [AI],
        locale: "ru_ru",
      }),
    ).toEqual({ text: source, changed: false });
  });

  it("switches an English game to the target language, never another choice", () => {
    const english = applyTranslationOptions("lang:en_us\n", {
      mcVersion: "1.20.1",
      packFiles: [],
      incompatibleFiles: [],
      locale: "ru_ru",
    });
    expect(english.text).toBe("lang:ru_ru\n");

    const german = applyTranslationOptions("lang:de_de\n", {
      mcVersion: "1.20.1",
      packFiles: [],
      incompatibleFiles: [],
      locale: "ru_ru",
    });
    expect(german.changed).toBe(false);
  });

  it("switches any other language when asked to, once translation is turned on", () => {
    const options = {
      mcVersion: "1.20.1",
      packFiles: [],
      incompatibleFiles: [],
      locale: "ru_ru",
      forceLocale: true,
    };
    expect(applyTranslationOptions("lang:zh_cn\n", options).text).toBe("lang:ru_ru\n");
    expect(applyTranslationOptions("lang:de_de\n", options).text).toBe("lang:ru_ru\n");
    expect(applyTranslationOptions("lang:ru_ru\n", options).changed).toBe(false);
    expect(
      applyTranslationOptions("lang:zh_CN\n", { ...options, mcVersion: "1.7.10" }).text,
    ).toBe("lang:ru_RU\n");
  });

  it("writes a fresh options.txt for a game that never ran", () => {
    const { text } = applyTranslationOptions(null, {
      mcVersion: "1.20.1",
      packFiles: [AI],
      incompatibleFiles: [],
      locale: "uk_ua",
    });

    expect(readOptionList(text, "resourcePacks")).toEqual([
      "vanilla",
      `file/${AI}`,
    ]);
    expect(text).toContain("lang:uk_ua");
  });

  it("uses bare file names and an upper-case country before 1.13 and 1.11", () => {
    const source =
      'resourcePacks:["Sphax.zip"]\nincompatibleResourcePacks:[]\nlang:en_US\n';

    const { text } = applyTranslationOptions(source, {
      mcVersion: "1.7.10",
      packFiles: [AI],
      incompatibleFiles: [],
      locale: "ru_ru",
    });

    expect(readOptionList(text, "resourcePacks")).toEqual([AI, "Sphax.zip"]);
    expect(text).toContain("lang:ru_RU");
  });

  it("leaves a list it cannot read alone", () => {
    const source = "resourcePacks:[broken\n";
    expect(
      applyTranslationOptions(source, {
        mcVersion: "1.20.1",
        packFiles: [AI],
        incompatibleFiles: [],
        locale: "ru_ru",
      }),
    ).toEqual({ text: source, changed: false });
  });

  it("keeps Windows line endings", () => {
    const { text } = applyTranslationOptions(
      'resourcePacks:["vanilla"]\r\nlang:en_us\r\n',
      { mcVersion: "1.20.1", packFiles: [AI], incompatibleFiles: [], locale: "ru_ru" },
    );
    expect(text).toContain("\r\nlang:ru_ru\r\n");
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
  });
});

describe("pack.mcmeta", () => {
  it.each([
    ["1.7.10", 1],
    ["1.12.2", 3],
    ["1.16.1", 5],
    ["1.16.5", 6],
    ["1.19.2", 9],
    ["1.19.4", 13],
    ["1.20.1", 15],
    ["1.20.2", null],
    ["1.21.1", null],
    ["26.1", null],
  ])("%s → %s", (version, format) => {
    expect(legacyPackFormat(version)).toBe(format);
  });

  it("declares a range for modern versions", () => {
    expect(JSON.parse(packMcmeta("26.1", "x")).pack).toMatchObject({
      pack_format: 15,
      supported_formats: [15, 9999],
      min_format: [15, 0],
      max_format: [9999, 0],
    });
    expect(JSON.parse(packMcmeta("1.12.2", "x")).pack).toEqual({
      pack_format: 3,
      description: "x",
    });
  });
});

describe("pack compatibility", () => {
  const rtf = {
    pack: {
      pack_format: 15,
      min_format: [15, 0],
      max_format: [1000, 0],
      supported_formats: [15, 1000],
    },
  };
  const mploc = {
    pack: { pack_format: 88 },
    supported_formats: { min_inclusive: 4, max_inclusive: 88 },
  };
  const ai = JSON.parse(packMcmeta("1.21.1", "x"));

  it("reads the game's resource format from its version.json", () => {
    expect(
      gameResourceFormat({ pack_version: { resource: 34, data: 48 } }, "1.21.1"),
    ).toBe(34);
    expect(
      gameResourceFormat(
        { pack_version: { resource_major: 69, resource_minor: 0 } },
        "1.21.9",
      ),
    ).toBe(69);
    expect(gameResourceFormat(null, "1.20.1")).toBe(15);
    expect(gameResourceFormat(null, "1.21.1")).toBeNull();
  });

  it("matches what 1.21.1 itself decided for the Aged instance", () => {
    expect(packSupportsGame(rtf, 34, "1.21.1")).toBe(true);
    expect(packSupportsGame(ai, 34, "1.21.1")).toBe(true);
    expect(packSupportsGame(mploc, 34, "1.21.1")).toBe(false);
  });

  it("reads only pack_format up to 1.20.1", () => {
    expect(packSupportsGame(rtf, 15, "1.20.1")).toBe(true);
    expect(packSupportsGame(rtf, 9, "1.19.2")).toBe(false);
    expect(
      packSupportsGame(JSON.parse(packMcmeta("1.19.2", "x")), 9, "1.19.2"),
    ).toBe(true);
  });

  it("uses min and max format from 1.21.9 on", () => {
    expect(packSupportsGame(rtf, 69, "1.21.9")).toBe(true);
    expect(
      packSupportsGame({ pack: { min_format: 70, max_format: 80 } }, 69, "1.21.9"),
    ).toBe(false);
    expect(packSupportsGame(null, 34, "1.21.1")).toBe(false);
  });
});
