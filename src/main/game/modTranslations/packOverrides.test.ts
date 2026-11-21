import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDefaultPacks,
  addTomlPacks,
  applyDefaultOptionsPacks,
  applyPackOverrides,
  removeTomlPacks,
  restoreDefaultOptionsPacks,
  restorePackOverrides,
} from "./packOverrides";

const CONFIG = [
  "{",
  '  "schema_version": "2",',
  '  "failed_reloads_per_session": 5,',
  '  "default_packs": [',
  '    "vanilla",',
  '    "betterbeds:fancyconnectedbeds",    ',
  '    "file/Fresh [Animations].zip"',
  "  ]",
  "}",
  "",
].join("\n");

describe("ResourcePackOverrides default packs", () => {
  it("appends our packs to the list and keeps the rest of the file", () => {
    const next = addDefaultPacks(CONFIG, ["file/grubie-i18n-ai-ru_ru.zip"]);
    expect(JSON.parse(next).default_packs).toEqual([
      "vanilla",
      "betterbeds:fancyconnectedbeds",
      "file/Fresh [Animations].zip",
      "file/grubie-i18n-ai-ru_ru.zip",
    ]);
    expect(next).toContain('    "betterbeds:fancyconnectedbeds",    \n');
    expect(next.endsWith("  ]\n}\n")).toBe(true);
    expect(addDefaultPacks(next, ["file/grubie-i18n-ai-ru_ru.zip"])).toBe(next);
    expect(addDefaultPacks('{"other": 1}', ["file/x.zip"])).toBe('{"other": 1}');
  });

  describe("in an instance", () => {
    let instance: string;
    let storage: string;
    const file = () => path.join(instance, "config", "resourcepackoverrides.json");

    beforeAll(async () => {
      instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-rpo-"));
      storage = path.join(instance, "storage");
      await fs.outputFile(file(), CONFIG, "utf8");
    });

    afterAll(async () => {
      await fs.remove(instance);
    });

    it("keeps our pack enabled on first launch and puts the file back", async () => {
      const first = await applyPackOverrides(instance, storage, ["grubie-i18n-ai-ru_ru.zip"], null);
      expect(first).not.toBeNull();
      expect(JSON.parse(await fs.readFile(file(), "utf8")).default_packs).toContain(
        "file/grubie-i18n-ai-ru_ru.zip",
      );
      const second = await applyPackOverrides(instance, storage, ["grubie-i18n-ai-ru_ru.zip"], first);
      expect(second).toEqual(first);

      await restorePackOverrides(instance, storage, second);
      expect(await fs.readFile(file(), "utf8")).toBe(CONFIG);
      expect(await applyPackOverrides(instance, storage, [], null)).toBeNull();
    });
  });
});

const TOML = [
  "# Resource pack IDs to have enabled by default on the first run.",
  'defaultResourcePacks = [ "vanilla","fabric","continuity:default","file/Low Fire.zip","file/COBBLEVERSE RP.zip" ]',
  "",
  "lockDifficulty = false",
  "",
].join("\n");

describe("DefaultOptions default resource packs", () => {
  const ours = ["file/grubie-i18n-ai-ru_ru.zip"];

  it("puts our pack under the player's packs, like options.txt, and takes it out again", () => {
    const next = addTomlPacks(TOML, ours);
    expect(next).toContain(
      '"continuity:default","file/grubie-i18n-ai-ru_ru.zip","file/Low Fire.zip"',
    );
    expect(addTomlPacks(next, ours)).toBe(next);
    expect(removeTomlPacks(next)).toBe(TOML);
  });

  it("handles lists on several lines, without player packs and when empty", () => {
    const multi = 'defaultResourcePacks = [\n  "vanilla",\n  "fabric" # mod packs\n]\n';
    const next = addTomlPacks(multi, ours);
    expect(next).toBe(
      'defaultResourcePacks = [\n  "vanilla",\n  "fabric",\n  "file/grubie-i18n-ai-ru_ru.zip" # mod packs\n]\n',
    );
    expect(removeTomlPacks(next)).toBe(multi);
    expect(addTomlPacks("defaultResourcePacks = []\n", ours)).toBe("defaultResourcePacks = []\n");
    expect(addTomlPacks("lockDifficulty = false\n", ours)).toBe("lockDifficulty = false\n");
    const first = addTomlPacks('defaultResourcePacks = ["file/a.zip"]', ours);
    expect(first).toBe('defaultResourcePacks = ["file/grubie-i18n-ai-ru_ru.zip", "file/a.zip"]');
    expect(removeTomlPacks(first)).toBe('defaultResourcePacks = ["file/a.zip"]');
  });

  it("edits the instance's config in place and restores it byte for byte", async () => {
    const instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-dopt-"));
    const file = path.join(instance, "config", "defaultoptions-common.toml");
    await fs.outputFile(file, TOML, "utf8");
    try {
      await applyDefaultOptionsPacks(instance, ours);
      expect(await fs.readFile(file, "utf8")).toContain("file/grubie-i18n-ai-ru_ru.zip");
      await applyDefaultOptionsPacks(instance, ["file/grubie-i18n-ai-uk_ua.zip"]);
      const switched = await fs.readFile(file, "utf8");
      expect(switched).toContain("file/grubie-i18n-ai-uk_ua.zip");
      expect(switched).not.toContain("ru_ru");
      await restoreDefaultOptionsPacks(instance);
      expect(await fs.readFile(file, "utf8")).toBe(TOML);
      await restoreDefaultOptionsPacks(path.join(instance, "missing"));
    } finally {
      await fs.remove(instance);
    }
  });
});
