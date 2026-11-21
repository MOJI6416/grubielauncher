import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDefaultOptions, withOption } from "./defaultOptions";

describe("DefaultOptions defaults", () => {
  let instance: string;

  beforeEach(async () => {
    instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-defaults-"));
  });

  afterEach(async () => {
    await fs.remove(instance);
  });

  it("reads the pack author's options.txt without key bindings, as DefaultOptions copies it", async () => {
    await fs.outputFile(
      path.join(instance, "config", "defaultoptions", "options.txt"),
      "version:3955\r\nlang:en_us\r\nkey_key.jump:key.keyboard.space\r\nguiScale:3\r\n",
      "utf8",
    );
    expect(await readDefaultOptions(instance)).toBe("version:3955\r\nlang:en_us\r\nguiScale:3\r\n");
    expect(await readDefaultOptions(path.join(instance, "missing"))).toBeNull();
  });

  it("sets one option and keeps the rest", () => {
    expect(withOption("version:3955\r\nlang:en_us\r\nguiScale:3\r\n", "lang", "ru_ru")).toBe(
      "version:3955\r\nlang:ru_ru\r\nguiScale:3\r\n",
    );
    expect(withOption("guiScale:3\n", "lang", "ru_ru")).toBe("guiScale:3\nlang:ru_ru\n");
    expect(withOption("guiScale:3", "lang", "ru_ru")).toBe("guiScale:3\nlang:ru_ru");
    expect(withOption("", "lang", "ru_ru")).toBe("lang:ru_ru");
  });
});
