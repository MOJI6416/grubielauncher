import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { FTB_QUESTS_CONTEXT, FTB_QUESTS_NAMESPACE } from "./ftbQuests";
import { decodeUtf8Strict } from "./langFiles";
import { LangEntries, needsTranslation, unitHash } from "./unitHash";

export const FTB_INLINE_BOOK = "ftbquests:inline";
export const FTB_INLINE_KEY_PREFIX = "grubie.ftbq.";

const QUESTS_DIR = ["config", "ftbquests", "quests"];
const STRING_KEYS = new Set(["title", "subtitle"]);
const LIST_KEYS = new Set(["description", "subtitle"]);
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_LINE_CHARS = 4000;
const UNIT_MAX_KEYS = 400;
const UNIT_MAX_CHARS = 60_000;

export interface InlineFile {
  file: string;
  digest: string;
}

interface Candidate {
  start: number;
  end: number;
  value: string;
}

interface Frame {
  type: "compound" | "list";
  key: string | null;
}

function readQuoted(text: string, start: number): { value: string; end: number } {
  const quote = text[start];
  let value = "";
  let index = start + 1;
  while (index < text.length) {
    const char = text[index++];
    if (char === quote) return { value, end: index };
    if (char === "\\") {
      const next = text[index++];
      value += next === "n" ? "\n" : next === "t" ? "\t" : next;
    } else {
      value += char;
    }
  }
  throw new Error("Unterminated string");
}

export function textStrings(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  const stack: Frame[] = [];
  let pendingKey: string | null = null;
  let expectKey = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/[\s,]/.test(char)) {
      index++;
      continue;
    }
    const frame = stack[stack.length - 1];
    if (char === "{" || char === "[") {
      const key = frame?.type === "list" ? frame.key : pendingKey;
      stack.push({ type: char === "{" ? "compound" : "list", key });
      expectKey = char === "{";
      pendingKey = null;
      index++;
      if (char === "[" && /^[BIL];/.test(text.slice(index, index + 2))) index += 2;
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      expectKey = stack[stack.length - 1]?.type === "compound";
      pendingKey = null;
      index++;
      continue;
    }
    if (char === ":") {
      expectKey = false;
      index++;
      continue;
    }
    let token: string;
    let end: number;
    const quoted = char === '"' || char === "'";
    if (quoted) {
      const read = readQuoted(text, index);
      token = read.value;
      end = read.end;
    } else {
      end = index;
      while (end < text.length && !/[\s,:{}[\]]/.test(text[end])) end++;
      token = text.slice(index, end);
      if (end === index) end++;
    }
    if (frame?.type === "compound" && expectKey) {
      pendingKey = token;
    } else if (quoted) {
      const key = frame?.type === "list" ? frame.key : pendingKey;
      const inList = frame?.type === "list";
      if (key && (inList ? LIST_KEYS.has(key) : STRING_KEYS.has(key))) {
        candidates.push({ start: index, end, value: token });
      }
      if (!inList) expectKey = true;
    } else if (frame?.type === "compound") {
      expectKey = true;
    }
    index = end;
  }
  return candidates;
}

function translatable(line: string): boolean {
  const text = line.trim();
  return (
    !!text &&
    line.length <= MAX_LINE_CHARS &&
    !/^[{[]\s*"/.test(text) &&
    !text.startsWith(`{${FTB_INLINE_KEY_PREFIX}`) &&
    !/\{(?:@pagebreak|image:|open_url:)/.test(text) &&
    needsTranslation(text.replace(/&[0-9a-fk-or]/gi, "").replace(/\{[^}]*\}/g, " "))
  );
}

export function inlineKey(line: string): string {
  return `${FTB_INLINE_KEY_PREFIX}${createHash("sha1").update(line).digest("hex").slice(0, 16)}`;
}

function quoteSnbt(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function rewriteInline(text: string): { text: string; english: LangEntries } {
  const english: LangEntries = {};
  let out = text;
  let candidates: Candidate[];
  try {
    candidates = textStrings(text);
  } catch {
    return { text, english };
  }
  for (const candidate of [...candidates].reverse()) {
    if (!translatable(candidate.value)) continue;
    const key = inlineKey(candidate.value);
    english[key] = candidate.value.replace(/%/g, "%%");
    out = `${out.slice(0, candidate.start)}${quoteSnbt(`{${key}}`)}${out.slice(candidate.end)}`;
  }
  return { text: out, english };
}

function questsDir(versionPath: string): string {
  return path.join(versionPath, ...QUESTS_DIR);
}

export async function usesInlineText(versionPath: string): Promise<boolean> {
  const dir = questsDir(versionPath);
  if (await fs.pathExists(path.join(dir, "lang"))) return false;
  return fs.pathExists(path.join(dir, "chapters"));
}

async function inlineFiles(versionPath: string): Promise<string[]> {
  const dir = questsDir(versionPath);
  const chapters = await fs.readdir(path.join(dir, "chapters")).catch(() => [] as string[]);
  return [
    "data.snbt",
    "chapter_groups.snbt",
    ...chapters.filter((name) => name.endsWith(".snbt")).sort().map((name) => `chapters/${name}`),
  ];
}

function digestOf(data: string | Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

function backupPath(storage: string, file: string): string {
  return path.join(storage, "ftbq-originals", ...file.split("/"));
}

async function originalText(
  versionPath: string,
  storage: string,
  file: string,
  owned: Map<string, string>,
): Promise<string | null> {
  const target = path.join(questsDir(versionPath), ...file.split("/"));
  const stat = await fs.stat(target).catch(() => null);
  if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) return null;
  const current = decodeUtf8Strict(await fs.readFile(target));
  if (current === null) return null;
  if (owned.get(file) === digestOf(current)) {
    return fs.readFile(backupPath(storage, file), "utf8").catch(() => null);
  }
  return current;
}

export async function readInlineEnglish(
  versionPath: string,
  storage: string,
  previous: InlineFile[],
): Promise<LangEntries> {
  if (!(await usesInlineText(versionPath))) return {};
  const owned = new Map(previous.map((entry) => [entry.file, entry.digest]));
  const english: LangEntries = {};
  for (const file of await inlineFiles(versionPath)) {
    const text = await originalText(versionPath, storage, file, owned);
    if (text) Object.assign(english, rewriteInline(text).english);
  }
  return english;
}

export function planInlineUnits(english: LangEntries) {
  const units: Array<{
    hash: string;
    namespace: string;
    book: string;
    entries: LangEntries;
    context: typeof FTB_QUESTS_CONTEXT;
  }> = [];
  let entries: LangEntries = {};
  let keys = 0;
  let chars = 0;
  const flush = () => {
    if (keys === 0) return;
    units.push({
      hash: unitHash(entries),
      namespace: FTB_QUESTS_NAMESPACE,
      book: FTB_INLINE_BOOK,
      entries,
      context: FTB_QUESTS_CONTEXT,
    });
    entries = {};
    keys = 0;
    chars = 0;
  };
  for (const key of Object.keys(english).sort()) {
    const value = english[key];
    if (keys >= UNIT_MAX_KEYS || chars + value.length > UNIT_MAX_CHARS) flush();
    entries[key] = value;
    keys++;
    chars += value.length;
  }
  flush();
  return units;
}

export async function applyInlineRewrite(
  versionPath: string,
  storage: string,
  previous: InlineFile[],
): Promise<InlineFile[]> {
  if (!(await usesInlineText(versionPath))) return previous;
  const owned = new Map(previous.map((entry) => [entry.file, entry.digest]));
  const result: InlineFile[] = [];
  for (const file of await inlineFiles(versionPath)) {
    const target = path.join(questsDir(versionPath), ...file.split("/"));
    const original = await originalText(versionPath, storage, file, owned);
    if (original === null) continue;
    const rewritten = rewriteInline(original);
    if (Object.keys(rewritten.english).length === 0) continue;
    const raw = await fs.readFile(target);
    const current = raw.toString("utf8");
    const ours = owned.get(file) === digestOf(current);
    if (!ours) {
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

export async function restoreInline(
  versionPath: string,
  storage: string,
  rewritten: InlineFile[],
): Promise<void> {
  for (const entry of rewritten) {
    const target = path.join(questsDir(versionPath), ...entry.file.split("/"));
    const backup = backupPath(storage, entry.file);
    const current = await fs.readFile(target).catch(() => null);
    if (current && digestOf(current) === entry.digest && (await fs.pathExists(backup))) {
      await fs.copy(backup, target, { overwrite: true });
    }
    await fs.remove(backup).catch(() => undefined);
  }
}
