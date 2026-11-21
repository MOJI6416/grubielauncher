import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createZipArchive, readEntryData, withArchive } from "../../utilities/archiver";

const fake = vi.hoisted(() => ({
  cache: "",
  source: "",
  sha1: "",
  downloads: 0,
}));

vi.mock("../../windows/mainWindow", () => ({ mainWindow: null }));
vi.mock("../../utilities/worldBackups", () => ({ isVersionRunning: () => false }));
vi.mock("../../utilities/other", () => ({ getLauncherPaths: () => ({ cache: fake.cache }) }));
vi.mock("../../utilities/downloader", () => ({
  Downloader: class {
    async downloadFiles(items: Array<{ destination: string }>) {
      for (const item of items) {
        fake.downloads++;
        await fs.copy(fake.source, item.destination);
      }
    }
  },
}));
vi.mock("../../journal/journal", () => ({
  journal: { warn: () => undefined, error: () => undefined, info: () => undefined },
}));
vi.mock("./translationApi", () => ({
  UNSUPPORTED_REASON: "unsupported",
  TranslationApiUnavailable: class extends Error {},
  isUnauthorized: () => false,
  TranslationApi: class {
    hasToken() {
      return true;
    }
    async matchPacks() {
      return [
        {
          key: "mploc-mods",
          title: "MPLOCmods",
          author: "Slava_vas",
          license: "CC-BY-SA-4.0",
          projectUrl: "https://modrinth.com/resourcepack/mploc_mods",
          source: "modrinth",
          projectId: "xeqX6g8g",
          fileId: "4Ph6g1ML",
          versionName: "v43",
          fileName: "MPLOCmods_v43.zip",
          url: "https://cdn.modrinth.com/data/xeqX6g8g/versions/4Ph6g1ML/MPLOCmods_v43.zip",
          sha1: fake.sha1,
          size: 1,
          covers: 1,
        },
      ];
    }
    async lookup(_lang: string, hashes: string[]) {
      return hashes.map((hash) => ({ hash, status: "pending" }));
    }
    async submit(_lang: string, units: Array<{ hash: string }>) {
      return { accepted: units.map((unit) => unit.hash), queued: units.length, rejected: [] };
    }
  },
}));

import { getModTranslationStatus, runSync } from "./sync";

let root: string;

async function zip(target: string, files: Record<string, string>) {
  await createZipArchive(
    [],
    target,
    undefined,
    6,
    undefined,
    Object.entries(files).map(([entry, data]) => ({ name: entry, data: Buffer.from(data, "utf8") })),
  );
}

async function entries(file: string): Promise<Record<string, string>> {
  return withArchive(file, async (archive) => {
    const out: Record<string, string> = {};
    for (const entry of archive.getEntries()) {
      if (!entry.isDirectory) out[entry.entryName] = (await readEntryData(entry)).toString("utf8");
    }
    return out;
  });
}

async function makeInstance(name: string): Promise<string> {
  const instance = path.join(root, name);
  await fs.outputFile(
    path.join(instance, "version.json"),
    JSON.stringify({ version: { id: "1.21.1" }, loader: { mods: [] } }),
  );
  await fs.outputFile(path.join(instance, "options.txt"), 'lang:ru_ru\nresourcePacks:["vanilla"]\n');
  await zip(path.join(instance, "mods", "waystones.jar"), {
    "fabric.mod.json": '{"id":"waystones","name":"Waystones"}',
    "assets/waystones/lang/en_us.json": '{"a":"Waystone","b":"Warp"}',
  });
  return instance;
}

async function enable(instance: string) {
  const file = path.join(instance, "storage", "mod-translations", "state.json");
  const state = await fs.readJSON(file).catch(() => ({}));
  await fs.outputJSON(file, { ...state, enabled: true });
  await getModTranslationStatus(instance, { launcherLang: "ru", token: "t" });
  await runSync(instance, "toggle");
}

const PACK = "grubie-i18n-mploc-mods.zip";

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-i18n-packs-"));
  fake.cache = path.join(root, "cache");
  fake.source = path.join(root, "MPLOCmods_v43.zip");
  await zip(fake.source, {
    "pack.mcmeta": '{"pack":{"pack_format":88,"description":"MPLOC"}}',
    "assets/waystones/lang/ru_ru.json": '{"a":"Путевой камень"}',
    "assets/numismatic-overhaul/lang/ru_ru.json": '{"n":"Монета","t":["Во","н"]}',
    "assets/bibliobiomes/lang/ru_ru.json": '{"x":"y",}',
  });
  fake.sha1 = "a".repeat(40);
});

afterAll(async () => {
  await fs.remove(root);
});

describe("community translation packs", () => {
  it("installs a copy with only this instance's mods and re-trims it when a mod is added", async () => {
    const instance = await makeInstance("Vanilla+");
    await enable(instance);

    const pack = path.join(instance, "resourcepacks", PACK);
    expect(Object.keys(await entries(pack)).sort()).toEqual([
      "assets/waystones/lang/ru_ru.json",
      "pack.mcmeta",
    ]);
    expect(await fs.pathExists(path.join(instance, "storage", "mod-translations", "packs", "mploc-mods.zip"))).toBe(true);
    expect(fake.downloads).toBe(1);

    await zip(path.join(instance, "mods", "numismatic.jar"), {
      "fabric.mod.json": '{"id":"numismatic-overhaul","name":"Numismatic Overhaul"}',
      "assets/numismatic-overhaul/lang/en_us.json": '{"n":"Coin","t":"Transfer"}',
    });
    await runSync(instance, "launch");

    const files = await entries(pack);
    expect(JSON.parse(files["assets/numismatic-overhaul/lang/ru_ru.json"])).toEqual({ n: "Монета" });
    expect(fake.downloads).toBe(1);
  });

  it("turns a full pack from an older launcher into a trimmed copy without downloading it again", async () => {
    const instance = await makeInstance("Old");
    const storage = path.join(instance, "storage", "mod-translations");
    await fs.copy(fake.source, path.join(instance, "resourcepacks", PACK));
    await fs.outputJSON(path.join(storage, "state.json"), {
      version: 1,
      enabled: true,
      locale: "ru_ru",
      packs: [
        {
          key: "mploc-mods",
          title: "MPLOCmods",
          author: "Slava_vas",
          license: "CC-BY-SA-4.0",
          url: "https://modrinth.com/resourcepack/mploc_mods",
          fileName: PACK,
          sha1: fake.sha1,
          source: "modrinth",
          projectId: "xeqX6g8g",
        },
      ],
    });
    const before = fake.downloads;

    await getModTranslationStatus(instance, { launcherLang: "ru", token: "t" });
    await runSync(instance, "launch");

    expect(fake.downloads).toBe(before);
    expect(Object.keys(await entries(path.join(instance, "resourcepacks", PACK))).sort()).toEqual([
      "assets/waystones/lang/ru_ru.json",
      "pack.mcmeta",
    ]);
    expect((await fs.readJSON(path.join(storage, "state.json"))).packs[0].trim).toMatch(/^[0-9a-f]{40}$/);
  });
});
