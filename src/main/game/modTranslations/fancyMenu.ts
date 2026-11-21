import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { decodeUtf8Strict } from "./langFiles";
import { LangEntries, needsTranslation, unitHash } from "./unitHash";

export const FANCYMENU_BOOK = "fancymenu:layouts";
export const FANCYMENU_NAMESPACE = "fancymenu";
export const FANCYMENU_KEY_PREFIX = "grubie.fancy.";
export const FANCYMENU_CONTEXT = {
  name: "FancyMenu",
  description:
    "Custom title, pause and loading screens of this modpack: button labels and text blocks with FancyMenu formatting (%n% is a line break, %#RRGGBB% a colour).",
};

const LAYOUT_DIR = ["config", "fancymenu", "customization"];
const FIELD = /^(\s*(?:label|hoverlabel|hover_label|description|source)\s*=\s*)(.*?)\s*$/;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const UNIT_MAX_KEYS = 400;

export interface FancyFile {
  file: string;
  digest: string;
}

function placeholder(key: string): string {
  return `{"placeholder":"local","values":{"key":"${key}"}}`;
}

export function fancyKey(value: string): string {
  return `${FANCYMENU_KEY_PREFIX}${createHash("sha1").update(value).digest("hex").slice(0, 16)}`;
}

function translatable(value: string): boolean {
  if (!value || value === "null" || value.startsWith("{") || value.startsWith("[source:")) return false;
  if (value.includes('{"placeholder"')) return false;
  if (/^[\w./\\:-]+\.(?:png|jpe?g|gif|txt|json|ogg|mp3|wav)$/i.test(value)) return false;
  if (/^https?:\/\//i.test(value)) return false;
  const plain = value
    .replace(/%#[0-9a-fA-F]{6}%|%#%|%n%/g, " ")
    .replace(/&[0-9a-fk-or]/gi, "")
    .replace(/\]\([^)]*\)/g, "]");
  return needsTranslation(plain);
}

export function rewriteLayout(text: string): { text: string; english: LangEntries } {
  const english: LangEntries = {};
  if (!/^\s*type\s*=\s*fancymenu_layout\s*$/m.test(text)) return { text, english };
  const lines = text.split(/(\r?\n)/).map((line) => {
    const match = FIELD.exec(line);
    if (!match || !translatable(match[2])) return line;
    const key = fancyKey(match[2]);
    english[key] = match[2].replace(/%/g, "%%");
    return `${match[1]}${placeholder(key)}`;
  });
  return { text: lines.join(""), english };
}

function layoutDir(versionPath: string): string {
  return path.join(versionPath, ...LAYOUT_DIR);
}

function digestOf(data: string | Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

function backupPath(storage: string, file: string): string {
  return path.join(storage, "fancymenu-originals", file);
}

async function layouts(versionPath: string): Promise<string[]> {
  const names = await fs.readdir(layoutDir(versionPath)).catch(() => [] as string[]);
  return names.filter((name) => name.endsWith(".txt")).sort();
}

async function originalText(
  versionPath: string,
  storage: string,
  file: string,
  owned: Map<string, string>,
): Promise<string | null> {
  const target = path.join(layoutDir(versionPath), file);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) return null;
  const current = decodeUtf8Strict(await fs.readFile(target));
  if (current === null) return null;
  if (owned.get(file) === digestOf(current)) {
    return fs.readFile(backupPath(storage, file), "utf8").catch(() => null);
  }
  return current;
}

export async function readFancyEnglish(
  versionPath: string,
  storage: string,
  previous: FancyFile[],
): Promise<LangEntries> {
  const owned = new Map(previous.map((entry) => [entry.file, entry.digest]));
  const english: LangEntries = {};
  for (const file of await layouts(versionPath)) {
    const text = await originalText(versionPath, storage, file, owned);
    if (text) Object.assign(english, rewriteLayout(text).english);
  }
  return english;
}

export function planFancyUnits(english: LangEntries) {
  const units: Array<{
    hash: string;
    namespace: string;
    book: string;
    entries: LangEntries;
    context: typeof FANCYMENU_CONTEXT;
  }> = [];
  const keys = Object.keys(english).sort();
  for (let index = 0; index < keys.length; index += UNIT_MAX_KEYS) {
    const entries: LangEntries = {};
    for (const key of keys.slice(index, index + UNIT_MAX_KEYS)) entries[key] = english[key];
    units.push({
      hash: unitHash(entries),
      namespace: FANCYMENU_NAMESPACE,
      book: FANCYMENU_BOOK,
      entries,
      context: FANCYMENU_CONTEXT,
    });
  }
  return units;
}

export async function applyFancyRewrite(
  versionPath: string,
  storage: string,
  previous: FancyFile[],
): Promise<FancyFile[]> {
  const owned = new Map(previous.map((entry) => [entry.file, entry.digest]));
  const result: FancyFile[] = [];
  for (const file of await layouts(versionPath)) {
    const original = await originalText(versionPath, storage, file, owned);
    if (original === null) continue;
    const rewritten = rewriteLayout(original);
    if (Object.keys(rewritten.english).length === 0) continue;
    const target = path.join(layoutDir(versionPath), file);
    const raw = await fs.readFile(target);
    const current = raw.toString("utf8");
    if (owned.get(file) !== digestOf(current)) {
      await fs.ensureDir(path.dirname(backupPath(storage, file)));
      await fs.writeFile(backupPath(storage, file), raw);
    }
    if (current !== rewritten.text) {
      await fs.writeFile(`${target}.grubie-tmp`, rewritten.text, "utf8");
      await fs.move(`${target}.grubie-tmp`, target, { overwrite: true });
    }
    result.push({ file, digest: digestOf(rewritten.text) });
  }
  return result;
}

export async function restoreFancy(
  versionPath: string,
  storage: string,
  rewritten: FancyFile[],
): Promise<void> {
  for (const entry of rewritten) {
    const target = path.join(layoutDir(versionPath), entry.file);
    const backup = backupPath(storage, entry.file);
    const current = await fs.readFile(target).catch(() => null);
    if (current && digestOf(current) === entry.digest && (await fs.pathExists(backup))) {
      await fs.copy(backup, target, { overwrite: true });
    }
    await fs.remove(backup).catch(() => undefined);
  }
}
