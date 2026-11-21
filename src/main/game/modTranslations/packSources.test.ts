import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listModpackPacks } from "./packSources";

let instance: string;

async function write(relative: string, data: string) {
  await fs.outputFile(path.join(instance, ...relative.split("/")), data, "utf8");
}

beforeAll(async () => {
  instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-packs-"));
  await write("options.txt", 'resourcePacks:["vanilla","file/COBBLEVERSE RP.zip"]\n');
  await write("config/resourcepackoverrides.json", '{"default_packs":["file/The-RCP.zip"]}');
  await write("resourcepacks/COBBLEVERSE RP.zip", "zip");
  await write("resourcepacks/The-RCP.zip", "zip");
  await write("resourcepacks/Turned Off.zip", "zip");
  await write("resourcepacks/grubie-i18n-ai-ru_ru.zip", "zip");
  await write("config/paxi/resourcepacks/guide_book/assets/a/lang/en_us.json", "{}");
  await write("kubejs/assets/zi100d/lang/en_us.json", "{}");
  await write("kubejs/server_scripts/a.js", "");
  await write("resources/betterquesting/lang/en_us.lang", "betterquesting.quest.1=Wood\n");
});

afterAll(async () => {
  await fs.remove(instance);
});

describe("listModpackPacks", () => {
  it("lists the modpack's own and enabled packs and leaves out ours", async () => {
    const sources = await listModpackPacks(instance);
    expect(sources.map((source) => [source.id, source.label, !!source.assetsRoot])).toEqual([
      ["pack:resourcepacks/COBBLEVERSE RP.zip", "COBBLEVERSE RP", false],
      ["pack:resourcepacks/The-RCP.zip", "The-RCP", false],
      ["pack:config/paxi/resourcepacks/guide_book", "guide_book", false],
      ["pack:kubejs", "KubeJS", false],
      ["pack:resources", "ResourceLoader", true],
    ]);
  });
});
