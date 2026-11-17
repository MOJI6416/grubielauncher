import { describe, expect, it } from "vitest";
import {
  applyTranslationOptions,
  legacyPackFormat,
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
      `file/${AI}`,
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
        locale: "ru_ru",
      }),
    ).toEqual({ text: source, changed: false });
  });

  it("switches an English game to the target language, never another choice", () => {
    const english = applyTranslationOptions("lang:en_us\n", {
      mcVersion: "1.20.1",
      packFiles: [],
      locale: "ru_ru",
    });
    expect(english.text).toBe("lang:ru_ru\n");

    const german = applyTranslationOptions("lang:de_de\n", {
      mcVersion: "1.20.1",
      packFiles: [],
      locale: "ru_ru",
    });
    expect(german.changed).toBe(false);
  });

  it("writes a fresh options.txt for a game that never ran", () => {
    const { text } = applyTranslationOptions(null, {
      mcVersion: "1.20.1",
      packFiles: [AI],
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
        locale: "ru_ru",
      }),
    ).toEqual({ text: source, changed: false });
  });

  it("keeps Windows line endings", () => {
    const { text } = applyTranslationOptions(
      'resourcePacks:["vanilla"]\r\nlang:en_us\r\n',
      { mcVersion: "1.20.1", packFiles: [AI], locale: "ru_ru" },
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
