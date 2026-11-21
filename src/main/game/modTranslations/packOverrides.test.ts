import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDefaultPacks, applyPackOverrides, restorePackOverrides } from "./packOverrides";

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
