import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { createZipArchive } from "../../utilities/archiver";
import { COMPONENT_KEY_PREFIX, rewriteComponent } from "./components";
import type { NamespaceLang } from "./jarScan";
import { readZipFiles } from "./jarScan";
import { decodeUtf8Strict } from "./langFiles";
import { ORIGIN_FILE, originEntries } from "./origins";
import type { LangEntries } from "./unitHash";

export const DATA_TEXT_NAMESPACE = "grubie";

const DATA_FOLDERS = [
  "config/paxi/datapacks",
  "config/openloader/data",
  "config/openloader/packs",
  "global_packs/required_data",
  "global_packs/optional_data",
  "datapacks",
];
const SINGLE_DATA = ["kubejs"];
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ZIP_BYTES = 64 * 1024 * 1024;

export interface DataPack {
  id: string;
  path: string;
  zip: boolean;
  label: string;
}

export interface RewrittenData {
  file: string;
  digest: string;
}

interface TextFile {
  name: string;
  text: string;
  raw: Buffer;
}

export interface BookPages {
  counts?: ReadonlyMap<string, number>;
  keys?: Set<string>;
}

type Rewriter = (
  text: string,
  book?: BookPages,
) => { text: string; entries: LangEntries } | null;

function rewriteJsonFields(paths: string[][]): Rewriter {
  return (text) => {
    let json: unknown;
    try {
      json = JSON.parse(text.replace(/^﻿/, ""));
    } catch {
      return null;
    }
    const entries: LangEntries = {};
    let changed = false;
    for (const fieldPath of paths) {
      let holder = json as Record<string, unknown> | null;
      for (const step of fieldPath.slice(0, -1)) {
        const next = holder?.[step];
        holder = next && typeof next === "object" && !Array.isArray(next) ? (next as Record<string, unknown>) : null;
      }
      const field = fieldPath[fieldPath.length - 1];
      if (!holder || holder[field] === undefined) continue;
      const result = rewriteComponent(holder[field]);
      if (Object.keys(result.entries).length === 0) continue;
      Object.assign(entries, result.entries);
      if (JSON.stringify(result.component) !== JSON.stringify(holder[field])) {
        holder[field] = result.component;
        changed = true;
      }
    }
    if (Object.keys(entries).length === 0) return null;
    return { text: changed ? `${JSON.stringify(json, null, 2)}\n` : text, entries };
  };
}

const COMMAND_TEXT =
  /^(\s*(?:execute\s.*?\brun\s+)?(?:tellraw\s+\S+|title\s+\S+\s+(?:title|subtitle|actionbar))\s+)(.+?)\s*$/;

function snbtString(raw: string): string {
  return raw.slice(1, -1).replace(/\\(.)/g, "$1");
}

function quoteSnbtSingle(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function isContinuationPage(component: unknown): boolean {
  if (!component || typeof component !== "object" || Array.isArray(component)) return false;
  const { translate, fallback } = component as Record<string, unknown>;
  return (
    typeof translate === "string" &&
    translate.startsWith(COMPONENT_KEY_PREFIX) &&
    /\.p\d+$/.test(translate) &&
    fallback === ""
  );
}

function rewriteBookPages(line: string, entries: LangEntries, book?: BookPages): string {
  const start = line.indexOf("pages:[");
  if (start < 0 || !line.includes("written_book")) return line;
  let index = start + "pages:[".length;
  const pages: string[] = [];
  let lead: string | null = null;
  let separator: string | null = null;
  let between = "";
  let changed = false;
  while (index < line.length) {
    const char = line[index];
    if (char === "]") break;
    if (char !== "'" && char !== '"') {
      between += char;
      index++;
      continue;
    }
    if (lead === null) lead = between;
    else separator ??= between;
    between = "";
    let end = index + 1;
    while (end < line.length && line[end] !== char) end += line[end] === "\\" ? 2 : 1;
    const raw = line.slice(index, end + 1);
    index = end + 1;
    let component: unknown;
    try {
      component = JSON.parse(snbtString(raw));
    } catch {
      pages.push(raw);
      continue;
    }
    if (isContinuationPage(component)) {
      changed = true;
      continue;
    }
    const result = rewriteComponent(component);
    if (Object.keys(result.entries).length === 0) {
      pages.push(raw);
      continue;
    }
    Object.assign(entries, result.entries);
    const rewritten = result.component;
    const same = JSON.stringify(rewritten) === JSON.stringify(component);
    pages.push(same ? raw : quoteSnbtSingle(JSON.stringify(rewritten)));
    if (!same) changed = true;
    const key =
      rewritten && typeof rewritten === "object" && !Array.isArray(rewritten)
        ? (rewritten as { translate?: unknown }).translate
        : undefined;
    if (typeof key !== "string" || !key.startsWith(COMPONENT_KEY_PREFIX)) continue;
    book?.keys?.add(key);
    const count = book?.counts?.get(key) ?? 1;
    for (let page = 2; page <= count; page++) {
      pages.push(
        quoteSnbtSingle(
          JSON.stringify({ ...(rewritten as object), translate: `${key}.p${page}`, fallback: "" }),
        ),
      );
      changed = true;
    }
  }
  if (!changed) return line;
  const head = line.slice(0, start + "pages:[".length);
  return `${head}${lead ?? ""}${pages.join(separator ?? ",")}${between}${line.slice(index)}`;
}

function rewriteFunction(
  text: string,
  book?: BookPages,
): { text: string; entries: LangEntries } | null {
  const entries: LangEntries = {};
  let changed = false;
  const lines = text.split(/(\r?\n)/).map((line) => {
    const paged = rewriteBookPages(line, entries, book);
    if (paged !== line) {
      changed = true;
      return paged;
    }
    const match = COMMAND_TEXT.exec(line);
    if (!match) return line;
    let component: unknown;
    try {
      component = JSON.parse(match[2]);
    } catch {
      return line;
    }
    const result = rewriteComponent(component);
    if (Object.keys(result.entries).length === 0) return line;
    Object.assign(entries, result.entries);
    if (JSON.stringify(result.component) === JSON.stringify(component)) return line;
    const next = `${match[1]}${JSON.stringify(result.component)}`;
    if (next !== line) changed = true;
    return next;
  });
  if (Object.keys(entries).length === 0) return null;
  return { text: changed ? lines.join("") : text, entries };
}

function rewriteWelcome(text: string): { text: string; entries: LangEntries } | null {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
  const elements = (json as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return null;
  const entries: LangEntries = {};
  let changed = false;
  const swap = (value: unknown): unknown => {
    const result = rewriteComponent(value);
    Object.assign(entries, result.entries);
    if (JSON.stringify(result.component) !== JSON.stringify(value)) changed = true;
    return result.component;
  };
  for (const element of elements) {
    if (!element || typeof element !== "object") continue;
    const holder = element as Record<string, unknown>;
    if (Array.isArray(holder.lines)) holder.lines = holder.lines.map(swap);
    if (holder.label !== undefined) holder.label = swap(holder.label);
  }
  if (Object.keys(entries).length === 0) return null;
  return { text: changed ? `${JSON.stringify(json, null, 2)}\n` : text, entries };
}

const REWRITERS: Array<{ match: RegExp; rewrite: Rewriter }> = [
  {
    match: /^data\/[^/]+\/advancements?\/.+\.json$/,
    rewrite: rewriteJsonFields([
      ["display", "title"],
      ["display", "description"],
    ]),
  },
  { match: /^data\/[^/]+\/functions?\/.+\.mcfunction$/, rewrite: rewriteFunction },
  { match: /^data\/[^/]+\/welcomescreen\/.+\.json$/, rewrite: rewriteWelcome },
];

function rewriterFor(name: string): Rewriter | null {
  return REWRITERS.find((entry) => entry.match.test(name))?.rewrite ?? null;
}

function readable(name: string): boolean {
  return !!rewriterFor(name) || ORIGIN_FILE.test(name);
}

async function listDir(root: string, relative = ""): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true }).catch(() => []);
  const names: string[] = [];
  for (const entry of entries) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) names.push(...(await listDir(root, name)));
    else if (entry.isFile()) names.push(name);
  }
  return names;
}

async function packFiles(pack: DataPack): Promise<TextFile[]> {
  if (pack.zip) {
    const files = await readZipFiles(pack.path, MAX_ZIP_BYTES);
    return (files ?? []).flatMap((file) => {
      if (!readable(file.name) || file.data.length > MAX_FILE_BYTES) return [];
      const text = decodeUtf8Strict(file.data);
      return text === null ? [] : [{ name: file.name, text, raw: file.data }];
    });
  }
  const out: TextFile[] = [];
  for (const name of await listDir(pack.path, "data")) {
    if (!readable(name)) continue;
    const file = path.join(pack.path, ...name.split("/"));
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.size > MAX_FILE_BYTES) continue;
    const raw = await fs.readFile(file);
    const text = decodeUtf8Strict(raw);
    if (text !== null) out.push({ name, text, raw });
  }
  return out;
}

export async function listDataPacks(versionPath: string): Promise<DataPack[]> {
  const packs: DataPack[] = [];
  const add = async (file: string, label: string) => {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) return;
    const zip = stat.isFile() && /\.zip$/i.test(file);
    if (!zip && !stat.isDirectory()) return;
    if (!zip && !(await fs.pathExists(path.join(file, "data")))) return;
    const id = path.relative(versionPath, file).split(path.sep).join("/");
    packs.push({ id, path: file, zip, label });
  };
  for (const folder of DATA_FOLDERS) {
    const root = path.join(versionPath, ...folder.split("/"));
    for (const name of (await fs.readdir(root).catch(() => [] as string[])).sort()) {
      await add(path.join(root, name), name.replace(/\.zip$/i, ""));
    }
  }
  for (const folder of SINGLE_DATA) await add(path.join(versionPath, folder), folder);
  return packs;
}

export async function scanDataPacks(
  packs: DataPack[],
  originKeysAreText = false,
  originsOnly = false,
  pageKeys?: Set<string>,
): Promise<NamespaceLang[]> {
  const langs: NamespaceLang[] = [];
  for (const pack of packs) {
    const english: LangEntries = {};
    for (const file of await packFiles(pack)) {
      const result = originsOnly ? null : rewriterFor(file.name)?.(file.text, { keys: pageKeys });
      if (result) Object.assign(english, result.entries);
      Object.assign(english, originEntries(file.name, file.text, originKeysAreText));
    }
    if (Object.keys(english).length === 0) continue;
    langs.push({
      namespace: DATA_TEXT_NAMESPACE,
      format: "json",
      english,
      translatedKeys: [],
      context: { name: pack.label, description: "A data pack of this modpack: advancements and chat messages." },
      origin: "pack",
    });
  }
  return langs;
}

function digestOf(data: string | Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

function backupPath(storage: string, id: string): string {
  return path.join(storage, "data-originals", ...id.split("/"));
}

export async function applyDataRewrite(
  storage: string,
  packs: DataPack[],
  previous: RewrittenData[],
  pageCounts?: ReadonlyMap<string, number>,
): Promise<RewrittenData[]> {
  const book: BookPages = { counts: pageCounts };
  const result: RewrittenData[] = [];
  const owned = new Map(previous.map((entry) => [entry.file, entry.digest]));
  for (const pack of packs) {
    if (pack.zip) {
      const files = await readZipFiles(pack.path, MAX_ZIP_BYTES);
      if (!files) continue;
      let changed = false;
      const next = files.map((file) => {
        const rewrite = file.data.length <= MAX_FILE_BYTES ? rewriterFor(file.name) : null;
        const text = rewrite ? decodeUtf8Strict(file.data) : null;
        const rewritten = text === null ? null : rewrite?.(text, book);
        if (!rewritten || rewritten.text === text) return file;
        changed = true;
        return { name: file.name, data: Buffer.from(rewritten.text, "utf8") };
      });
      const current = await fs.readFile(pack.path);
      if (!changed) {
        if (owned.get(pack.id) === digestOf(current)) result.push({ file: pack.id, digest: digestOf(current) });
        continue;
      }
      if (owned.get(pack.id) !== digestOf(current)) {
        await fs.ensureDir(path.dirname(backupPath(storage, pack.id)));
        await fs.writeFile(backupPath(storage, pack.id), current);
      }
      const temp = `${pack.path}.grubie-tmp`;
      await createZipArchive([], temp, undefined, 9, undefined, next);
      await fs.move(temp, pack.path, { overwrite: true });
      result.push({ file: pack.id, digest: digestOf(await fs.readFile(pack.path)) });
      continue;
    }
    for (const file of await packFiles(pack)) {
      if (!rewriterFor(file.name)) continue;
      const id = `${pack.id}/${file.name}`;
      const rewritten = rewriterFor(file.name)?.(file.text, book);
      if (!rewritten) continue;
      const target = path.join(pack.path, ...file.name.split("/"));
      if (rewritten.text === file.text) {
        if (owned.get(id) === digestOf(file.text)) result.push({ file: id, digest: owned.get(id)! });
        continue;
      }
      if (owned.get(id) !== digestOf(file.text)) {
        await fs.ensureDir(path.dirname(backupPath(storage, id)));
        await fs.writeFile(backupPath(storage, id), file.raw);
      }
      await fs.writeFile(`${target}.grubie-tmp`, rewritten.text, "utf8");
      await fs.move(`${target}.grubie-tmp`, target, { overwrite: true });
      result.push({ file: id, digest: digestOf(rewritten.text) });
    }
  }
  return result;
}

export async function restoreDataRewrite(
  versionPath: string,
  storage: string,
  rewritten: RewrittenData[],
): Promise<void> {
  for (const entry of rewritten) {
    const target = path.join(versionPath, ...entry.file.split("/"));
    const backup = backupPath(storage, entry.file);
    const current = await fs.readFile(target).catch(() => null);
    if (current && digestOf(current) === entry.digest && (await fs.pathExists(backup))) {
      await fs.copy(backup, target, { overwrite: true });
    }
    await fs.remove(backup).catch(() => undefined);
  }
}
