import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import type { NamespaceLang } from "./jarScan";
import { lenientJson } from "./langFiles";
import { LangEntries, needsTranslation } from "./unitHash";

export const QUESTZ_NAMESPACE = "questz";
export const QUESTZ_KEY_PREFIX = "grubie.questz.";
export const QUESTZ_CHAPTERS_DIR = ["questz", "chapters"];
export const QUESTZ_CONTEXT = {
  name: "QuestZ",
  description:
    "The quest line of this modpack: chapter titles, quest titles and quest descriptions shown in the quest book.",
};

const MAX_CHAPTER_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 4000;

type Json = unknown;
type Holder = Record<string | number, Json>;

export interface QuestzChapter {
  file: string;
  json: Json;
  english: LangEntries;
}

export interface RewrittenChapter {
  file: string;
  digest: string;
}

interface Translatable {
  translate: string;
  fallback: string;
}

function idPart(value: unknown, fallback: string): string {
  const normalize = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return normalize(text) || normalize(fallback) || "chapter";
}

function ourComponent(value: unknown): value is Translatable {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Translatable).translate === "string" &&
    (value as Translatable).translate.startsWith(QUESTZ_KEY_PREFIX) &&
    typeof (value as Translatable).fallback === "string"
  );
}

function textSlots(json: Json, stem: string): Array<[string, Holder, string | number]> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const chapter = json as Holder;
  const chapterId = idPart(chapter.id, stem);
  const slots: Array<[string, Holder, string | number]> = [
    [`${QUESTZ_KEY_PREFIX}${chapterId}.title`, chapter, "title"],
  ];
  const quests = Array.isArray(chapter.quests) ? chapter.quests : [];
  quests.forEach((quest, index) => {
    if (!quest || typeof quest !== "object" || Array.isArray(quest)) return;
    const holder = quest as Holder;
    const base = `${QUESTZ_KEY_PREFIX}${chapterId}.${idPart(holder.id, String(index))}`;
    slots.push([`${base}.title`, holder, "title"]);
    if (Array.isArray(holder.description)) {
      holder.description.forEach((_line, line) => {
        slots.push([`${base}.description.${line}`, holder.description as Holder, line]);
      });
    } else {
      slots.push([`${base}.description`, holder, "description"]);
    }
  });
  return slots;
}

function englishOf(value: Json): string | null {
  if (typeof value === "string") return value;
  return ourComponent(value) ? value.fallback : null;
}

function worthTranslating(text: string | null): text is string {
  return !!text && text.length <= MAX_TEXT_CHARS && needsTranslation(text);
}

export function chapterEnglish(json: Json, stem: string): LangEntries {
  const english: LangEntries = {};
  for (const [key, holder, field] of textSlots(json, stem)) {
    const text = englishOf(holder[field]);
    if (worthTranslating(text)) english[key] = text;
  }
  return english;
}

export function rewriteChapter(json: Json, stem: string): Json {
  const copy = JSON.parse(JSON.stringify(json)) as Json;
  for (const [key, holder, field] of textSlots(copy, stem)) {
    const value = holder[field];
    if (typeof value === "string" && worthTranslating(value)) {
      holder[field] = { translate: key, fallback: value };
    }
  }
  return copy;
}

function chaptersDir(versionPath: string): string {
  return path.join(versionPath, ...QUESTZ_CHAPTERS_DIR);
}

function backupDir(storage: string): string {
  return path.join(storage, "questz-originals");
}

function digestOf(data: string | Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

export async function readQuestzChapters(versionPath: string): Promise<QuestzChapter[]> {
  const folder = chaptersDir(versionPath);
  const names = await fs.readdir(folder).catch(() => [] as string[]);
  const chapters: QuestzChapter[] = [];
  for (const name of names.sort()) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    const file = path.join(folder, name);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size > MAX_CHAPTER_BYTES) continue;
    let json: Json;
    try {
      json = lenientJson((await fs.readFile(file, "utf8")).replace(/^﻿/, ""));
    } catch {
      continue;
    }
    const english = chapterEnglish(json, name.slice(0, -5));
    if (Object.keys(english).length > 0) chapters.push({ file: name, json, english });
  }
  return chapters;
}

export function questzNamespace(chapters: QuestzChapter[]): NamespaceLang | null {
  const english: LangEntries = {};
  for (const chapter of chapters) Object.assign(english, chapter.english);
  if (Object.keys(english).length === 0) return null;
  return {
    namespace: QUESTZ_NAMESPACE,
    format: "json",
    english,
    translatedKeys: [],
    context: QUESTZ_CONTEXT,
    origin: "quests",
  };
}

export async function applyQuestzRewrite(
  versionPath: string,
  storage: string,
  previous: RewrittenChapter[],
): Promise<RewrittenChapter[]> {
  const folder = chaptersDir(versionPath);
  const result: RewrittenChapter[] = [];
  for (const chapter of await readQuestzChapters(versionPath)) {
    const file = path.join(folder, chapter.file);
    const current = await fs.readFile(file);
    const text = `${JSON.stringify(rewriteChapter(chapter.json, chapter.file.slice(0, -5)), null, 2)}\n`;
    const digest = digestOf(text);
    const known = previous.find((entry) => entry.file === chapter.file);
    const ours = known?.digest === digestOf(current);
    if (digest !== digestOf(current)) {
      if (!ours) {
        await fs.ensureDir(backupDir(storage));
        await fs.writeFile(path.join(backupDir(storage), chapter.file), current);
      }
      const temp = `${file}.grubie-tmp`;
      await fs.writeFile(temp, text, "utf8");
      await fs.move(temp, file, { overwrite: true });
    } else if (!ours && !known) {
      continue;
    }
    result.push({ file: chapter.file, digest });
  }
  return result;
}

export async function restoreQuestz(
  versionPath: string,
  storage: string,
  rewritten: RewrittenChapter[],
): Promise<void> {
  const folder = chaptersDir(versionPath);
  for (const entry of rewritten) {
    const file = path.join(folder, entry.file);
    const backup = path.join(backupDir(storage), entry.file);
    const current = await fs.readFile(file).catch(() => null);
    if (current && digestOf(current) === entry.digest && (await fs.pathExists(backup))) {
      await fs.copy(backup, file, { overwrite: true });
    }
    await fs.remove(backup).catch(() => undefined);
  }
}
