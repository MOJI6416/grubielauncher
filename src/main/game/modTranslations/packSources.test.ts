import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listModpackPacks } from "./packSources";

let instance: string;

beforeAll(async () => {
  instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-packs-"));
  await fs.outputFile(path.join(instance, "resourcepacks", "COBBLEVERSE RP.zip"), "zip");
  await fs.outputFile(path.join(instance, "resourcepacks", "grubie-i18n-ai-ru_ru.zip"), "zip");
  await fs.outputFile(
    path.join(instance, "config", "paxi", "resourcepacks", "guide_book", "assets", "a", "lang", "en_us.json"),
    "{}",
  );
  await fs.outputFile(path.join(instance, "kubejs", "assets", "zi100d", "lang", "en_us.json"), "{}");
  await fs.outputFile(path.join(instance, "kubejs", "server_scripts", "a.js"), "");
});

afterAll(async () => {
  await fs.remove(instance);
});

describe("listModpackPacks", () => {
  it("lists the modpack's own packs and leaves out ours", async () => {
    const sources = await listModpackPacks(instance);
    expect(sources.map((source) => [source.id, source.label])).toEqual([
      ["pack:resourcepacks/COBBLEVERSE RP.zip", "COBBLEVERSE RP"],
      ["pack:config/paxi/resourcepacks/guide_book", "guide_book"],
      ["pack:kubejs", "KubeJS"],
    ]);
  });
});
