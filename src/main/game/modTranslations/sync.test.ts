import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createZipArchive,
  readArchiveEntry,
  readJSONFromArchive,
} from "../../utilities/archiver";

const fake = vi.hoisted(() => ({
  cache: "",
  submitted: [] as Array<{ hash: string; namespace: string; kind?: string; context?: unknown; entries: Record<string, string> }>,
  done: new Map<string, Record<string, string>>(),
  quota: false,
  submitCalls: 0,
}));

vi.mock("../../windows/mainWindow", () => ({ mainWindow: null }));
vi.mock("../../utilities/worldBackups", () => ({ isVersionRunning: () => false }));
vi.mock("../../utilities/other", () => ({ getLauncherPaths: () => ({ cache: fake.cache }) }));
vi.mock("../../utilities/downloader", () => ({ Downloader: class {} }));
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
      return [];
    }
    async lookup(_lang: string, hashes: string[]) {
      return hashes.map((hash) =>
        fake.done.has(hash)
          ? { hash, status: "done", entries: fake.done.get(hash) }
          : { hash, status: fake.submitted.some((unit) => unit.hash === hash) ? "pending" : "missing" },
      );
    }
    async submit(_lang: string, units: typeof fake.submitted) {
      fake.submitCalls++;
      if (fake.quota) {
        return {
          accepted: [],
          queued: 0,
          rejected: units.map((unit) => ({ hash: unit.hash, reason: "quota" })),
        };
      }
      fake.submitted.push(...units);
      return { accepted: units.map((unit) => unit.hash), queued: units.length, rejected: [] };
    }
  },
}));

import { getModTranslationStatus, nextQuotaReset, runSync } from "./sync";

let root: string;
let instance: string;

async function jar(name: string, files: Record<string, string>) {
  await createZipArchive(
    [],
    path.join(instance, "mods", name),
    undefined,
    6,
    undefined,
    Object.entries(files).map(([entry, data]) => ({ name: entry, data: Buffer.from(data, "utf8") })),
  );
}

async function write(relative: string, data: string) {
  await fs.outputFile(path.join(instance, ...relative.split("/")), data, "utf8");
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-i18n-sync-"));
  fake.cache = path.join(root, "cache");
  instance = path.join(root, "Aged");
  await write("version.json", JSON.stringify({ version: { id: "1.21.1" }, loader: { mods: [] } }));
  await write("options.txt", "lang:ru_ru\nresourcePacks:[\"vanilla\",\"guide_book\",\"file/Compat.zip\"]\n");
  await createZipArchive(
    [],
    path.join(instance, "resourcepacks", "Compat.zip"),
    undefined,
    6,
    undefined,
    Object.entries({
      "pack.mcmeta": '{"pack":{"pack_format":34,"description":"Compat"}}',
      "assets/lavender/lang/en_us.json": '{"text.lavender.search":"Find"}',
      "assets/missingmod/lang/en_us.json": '{"item.missing.ghost":"Ghost item"}',
    }).map(([entry, data]) => ({ name: entry, data: Buffer.from(data, "utf8") })),
  );
  await jar("lavender.jar", {
    "fabric.mod.json": '{"id":"lavender","name":"Lavender","description":"Guide books in Markdown"}',
    "assets/lavender/lang/en_us.json": '{"text.lavender.search":"Search","text.lavender.other":"Other"}',
  });
  await write(
    "config/paxi/resourcepacks/guide_book/pack.mcmeta",
    '{"pack":{"pack_format":34,"description":"Aged Guide Book"}}',
  );
  await write(
    "config/paxi/resourcepacks/guide_book/assets/agedaddition/lavender/entries/guide_book/landing_page.md",
    '```json\n{\n  "title": "Guide Book"\n}\n```\n\nOpen quests with <keybind;key.questz.openquestscreen>.\n',
  );
  await jar("patchouli.jar", {
    "fabric.mod.json": '{"id":"patchouli","name":"Patchouli"}',
    "assets/patchouli/lang/en_us.json": '{"patchouli.gui.lexicon.home":"Home"}',
  });
  await write(
    "patchouli_books/notebook/en_us/entries/start.json",
    JSON.stringify({ name: "Start", category: "patchouli:basics", pages: ["Read me first."] }),
  );
  await write("patchouli_books/notebook/zh_cn/entries/start.json", '{"name":"开始"}');
  await write(
    "questz/chapters/76a9fc9e.json",
    JSON.stringify({ quests: [{ id: "6db07bbe", title: "Pick rocks", description: ["Gather rocks"] }] }),
  );
  await write(
    "config/ftbquests/quests/lang/en_us/chapters/stone_age.snbt",
    '{\n\tquest.1111111111111111.title: "Stone"\n}\n',
  );
  await write(
    "config/ftbquests/quests/lang/en_us.snbt",
    '{\n\tquest.0123456789ABCDEF.title: "Wood"\n}\n',
  );
});

afterAll(async () => {
  await fs.remove(root);
});

async function toggle(enabled: boolean, at = instance) {
  const file = path.join(at, "storage", "mod-translations", "state.json");
  const state = await fs.readJSON(file).catch(() => ({}));
  await fs.outputJSON(file, { ...state, enabled });
  await getModTranslationStatus(at, { launcherLang: "ru", token: "t" });
  await runSync(at, "toggle");
}

const REJECTED = "grubie.questz.76a9fc9e.6db07bbe.description.0";

function translateEverything() {
  for (const unit of fake.submitted) {
    fake.done.set(
      unit.hash,
      Object.fromEntries(
        Object.entries(unit.entries)
          .filter(([key]) => key !== REJECTED)
          .map(([key, value]) => [key, `RU ${value}`]),
      ),
    );
  }
}

describe("mod translation sync", () => {
  it("sends the mod context, the guide book and the quests, then installs them", async () => {
    await toggle(true);

    const lavender = fake.submitted.find((unit) => "text.lavender.other" in unit.entries);
    expect(lavender?.context).toEqual({ name: "Lavender", description: "Guide books in Markdown" });
    expect(lavender?.kind).toBeUndefined();
    const book = fake.submitted.find((unit) => unit.kind === "book" && unit.namespace === "agedaddition");
    expect(book?.context).toEqual({ name: "Aged Guide Book" });
    expect(Object.keys(book!.entries)).toEqual([
      "entries/landing_page.md#title",
      "entries/landing_page.md#001",
    ]);
    expect(fake.submitted.find((unit) => unit.namespace === "ftbquests")?.kind).toBe("book");
    const questz = fake.submitted.find((unit) => unit.namespace === "questz");
    expect(questz?.kind).toBeUndefined();
    expect(questz?.entries).toEqual({
      "grubie.questz.76a9fc9e.6db07bbe.title": "Pick rocks",
      "grubie.questz.76a9fc9e.6db07bbe.description.0": "Gather rocks",
    });
    expect(await fs.readFile(path.join(instance, "questz/chapters/76a9fc9e.json"), "utf8")).not.toContain(
      "translate",
    );

    expect(fake.submitted.some((unit) => "item.missing.ghost" in unit.entries)).toBe(false);
    expect(lavender?.entries).toEqual({ "text.lavender.other": "Other" });
    expect(
      fake.submitted.find((unit) => "text.lavender.search" in unit.entries)?.entries,
    ).toEqual({ "text.lavender.search": "Find" });
    const order = fake.submitted.map((unit) =>
      unit.namespace === "questz" || unit.namespace === "ftbquests" ? 0 : unit.kind === "book" ? 1 : 2,
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));

    translateEverything();
    await runSync(instance, "refresh");

    const pack = path.join(instance, "resourcepacks", "grubie-i18n-ai-ru_ru.zip");
    const lang = await readJSONFromArchive<Record<string, string>>(pack, "assets/lavender/lang/ru_ru.json");
    expect(lang).toEqual({ "text.lavender.other": "RU Other", "text.lavender.search": "RU Find" });
    const page = String(
      await readArchiveEntry(
        pack,
        "assets/agedaddition/lavender/entries/guide_book/ru_ru/landing_page.md",
      ),
    );
    expect(page).toContain('"title": "RU Guide Book"');
    expect(page).toContain("RU Open quests with <keybind;key.questz.openquestscreen>.");

    const notebook = await fs.readJSON(
      path.join(instance, "patchouli_books/notebook/ru_ru/entries/start.json"),
    );
    expect(notebook).toEqual({
      name: "RU Start",
      category: "patchouli:basics",
      pages: ["RU Read me first."],
    });

    const quests = await fs.readFile(
      path.join(instance, "config/ftbquests/quests/lang/ru_ru.snbt"),
      "utf8",
    );
    expect(quests).toContain('quest.0123456789ABCDEF.title: "RU Wood"');
    expect(quests).toContain('quest.1111111111111111.title: "RU Stone"');
    const questzLang = await readJSONFromArchive<Record<string, string>>(pack, "assets/questz/lang/ru_ru.json");
    expect(questzLang?.["grubie.questz.76a9fc9e.6db07bbe.title"]).toBe("RU Pick rocks");
    const chapter = await fs.readJSON(path.join(instance, "questz/chapters/76a9fc9e.json"));
    expect(chapter.quests[0].title).toEqual({
      translate: "grubie.questz.76a9fc9e.6db07bbe.title",
      fallback: "Pick rocks",
    });
    expect(
      await fs.readFile(path.join(instance, "config/paxi/resourcepacks/guide_book/assets/agedaddition/lavender/entries/guide_book/landing_page.md"), "utf8"),
    ).toContain('"title": "Guide Book"');
    expect(await fs.readFile(path.join(instance, "options.txt"), "utf8")).toContain(
      "file/grubie-i18n-ai-ru_ru.zip",
    );

    const status = await getModTranslationStatus(instance, { launcherLang: "ru", token: "t" });
    expect(status.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: "mods", title: "Lavender", format: null, translated: 1, pending: 0 }),
        expect.objectContaining({ group: "books", title: "Aged Guide Book", format: "lavender", strings: 2, translated: 2 }),
        expect.objectContaining({ group: "quests", title: "FTB Quests", format: "ftbquests", translated: 2 }),
        expect.objectContaining({ group: "quests", title: "QuestZ", format: "questz", strings: 2, translated: 1, failed: 1 }),
        expect.objectContaining({ group: "packs", title: "Compat", translated: 1 }),
        expect.objectContaining({ group: "books", title: "notebook", format: "patchouli", translated: 2 }),
      ]),
    );
  });

  it("removes only its own quest file when translation is turned off", async () => {
    await toggle(false);

    expect(await fs.pathExists(path.join(instance, "config/ftbquests/quests/lang/ru_ru.snbt"))).toBe(false);
    expect(await fs.pathExists(path.join(instance, "config/ftbquests/quests/lang/en_us.snbt"))).toBe(true);
    expect(await fs.pathExists(path.join(instance, "patchouli_books/notebook/ru_ru/entries/start.json"))).toBe(false);
    expect(await fs.pathExists(path.join(instance, "patchouli_books/notebook/ru_ru"))).toBe(false);
    expect(await fs.pathExists(path.join(instance, "patchouli_books/notebook/zh_cn/entries/start.json"))).toBe(true);
    expect((await fs.readJSON(path.join(instance, "questz/chapters/76a9fc9e.json"))).quests[0].title).toBe(
      "Pick rocks",
    );
    expect(await fs.pathExists(path.join(instance, "resourcepacks", "grubie-i18n-ai-ru_ru.zip"))).toBe(false);
  });

  it("never takes over a quest translation the pack author ships", async () => {
    await write("config/ftbquests/quests/lang/ru_ru.snbt", '{\n\tquest.0123456789ABCDEF.title: "Дерево"\n}\n');
    fake.submitted.length = 0;
    await write("options.txt", 'lang:zh_cn\nresourcePacks:["vanilla"]\n');
    await toggle(true);
    expect(await fs.readFile(path.join(instance, "options.txt"), "utf8")).toMatch(/^lang:ru_ru$/m);

    await write("options.txt", 'lang:de_de\nresourcePacks:["vanilla"]\n');
    await runSync(instance, "refresh");
    expect(await fs.readFile(path.join(instance, "options.txt"), "utf8")).toMatch(/^lang:de_de$/m);

    expect(fake.submitted.some((unit) => unit.namespace === "ftbquests")).toBe(false);
    expect(
      await fs.readFile(path.join(instance, "config/ftbquests/quests/lang/ru_ru.snbt"), "utf8"),
    ).toContain("Дерево");
  });

  it("waits for the daily quota to reset and says when", async () => {
    expect(nextQuotaReset(Date.UTC(2026, 10, 21, 18, 30))).toBe(Date.UTC(2026, 10, 22, 0, 5));

    fake.quota = true;
    await write(
      "questz/chapters/extra.json",
      JSON.stringify({ id: "extra", quests: [{ id: "q1", title: "Brand new quest" }] }),
    );
    await runSync(instance, "refresh");
    const status = await getModTranslationStatus(instance, { launcherLang: "ru", token: "t" });
    expect(status.error).toBe("quota");
    expect(status.retryAt).toBeGreaterThan(Date.now());
    expect(status.retryAt).toBeLessThanOrEqual(nextQuotaReset());

    const calls = fake.submitCalls;
    await runSync(instance, "refresh");
    expect(fake.submitCalls).toBe(calls);
    fake.quota = false;
  });

  it("translates old FTB Quests chapters through lang keys and puts them back", async () => {
    const old = path.join(root, "OldPack");
    const chapter = path.join(old, "config", "ftbquests", "quests", "chapters", "start.snbt");
    const original = '{\n\tquests: [{ id: "1111111111111111" title: "Chop wood" }]\n\ttitle: "First steps"\n}\n';
    await fs.outputFile(path.join(old, "version.json"), JSON.stringify({ version: { id: "1.20.1" }, loader: { mods: [] } }));
    await fs.outputFile(path.join(old, "options.txt"), "lang:ru_ru\n");
    await fs.outputFile(chapter, original);

    await toggle(true, old);
    const unit = fake.submitted.find((entry) => Object.values(entry.entries).includes("Chop wood"));
    expect(unit?.kind).toBe("book");
    translateEverything();
    await runSync(old, "refresh");

    const pack = path.join(old, "resourcepacks", "grubie-i18n-ai-ru_ru.zip");
    const russian = await readJSONFromArchive<Record<string, string>>(pack, "assets/grubie/lang/ru_ru.json");
    const english = await readJSONFromArchive<Record<string, string>>(pack, "assets/grubie/lang/en_us.json");
    expect(Object.values(russian ?? {}).sort()).toEqual(["RU Chop wood", "RU First steps"]);
    expect(Object.values(english ?? {}).sort()).toEqual(["Chop wood", "First steps"]);
    expect(await fs.readFile(chapter, "utf8")).toMatch(/title: "\{grubie\.ftbq\.[0-9a-f]{16}\}"/);

    await toggle(false, old);
    expect(await fs.readFile(chapter, "utf8")).toBe(original);
    expect(await fs.readFile(path.join(old, "options.txt"), "utf8")).toBe("lang:ru_ru\n");
    expect(await fs.pathExists(path.join(old, "storage", "mod-translations", "ftbq-originals"))).toBe(false);
  });
});
