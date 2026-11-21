import { lenientJson } from "./langFiles";
import type { ModContext } from "./modContext";
import { LangEntries, needsTranslation, unitHash } from "./unitHash";

export type BookFormat = "lavender" | "patchouli" | "guideme";
export type BookPart = "entries" | "categories";

export interface BookDoc {
  format: BookFormat;
  namespace: string;
  book: string;
  part: BookPart;
  path: string;
  text: string;
  external?: boolean;
}

export interface BookPath {
  format: BookFormat;
  namespace: string;
  book: string;
  part: BookPart;
  path: string;
  locale: string | null;
}

export interface BookGroup {
  key: string;
  format: BookFormat;
  namespace: string;
  book: string;
  context?: ModContext;
  docs: BookDoc[];
}

export interface BookSource {
  books: BookDoc[];
  translatedDocs: string[];
  patchouliI18n: string[];
  context?: ModContext | null;
}

export interface PlannedBookUnit {
  hash: string;
  namespace: string;
  book: string;
  entries: LangEntries;
  context?: ModContext;
}

export const SOURCE_BOOK_LOCALE = "en_us";
export const BOOK_FORMATS: readonly BookFormat[] = ["lavender", "patchouli", "guideme"];
export const MAX_BOOK_BYTES = 1024 * 1024;

const MAX_SEGMENT_CHARS = 4000;
const MAX_KEY_CHARS = 240;
const UNIT_MAX_KEYS = 400;
const UNIT_MAX_CHARS = 60_000;

const LOCALE = /^[a-z]{2,3}_[a-z]{2,4}$/;
const LAVENDER_PATH =
  /^assets\/([a-z0-9_.-]+)\/lavender\/(entries|categories)\/([a-z0-9_.-]+)\/(.+\.md)$/;
const PATCHOULI_PATH =
  /^assets\/([a-z0-9_.-]+)\/patchouli_books\/([a-z0-9_.-]+)\/([a-z]{2,3}_[a-z]{2,4})\/(entries|categories)\/(.+\.json)$/;
const PATCHOULI_BOOK =
  /^data\/([a-z0-9_.-]+)\/patchouli_books\/([a-z0-9_.-]+)\/book\.json$/;
const FRONTMATTER = /^(\s*```json[ \t]*\r?\n)([\s\S]*?)(\r?\n```[ \t]*)(?=\r?\n|$)/;
const YAML_FRONTMATTER = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*)(?=\r?\n|$)/;
const YAML_TITLE = /^([ \t]+title:[ \t]*)(.*?)[ \t]*$/m;
const GUIDEME_PATH =
  /^assets\/([a-z0-9_.-]+)\/(ae2guide|guides\/[a-z0-9_.-]+\/[a-z0-9_.-]+)\/(.+\.md)$/;
const META_TITLE = /("title"\s*:\s*)("(?:[^"\\]|\\.)*")/;
const LANG_KEY = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/i;
const PAGE_FIELDS = ["title", "text", "name"] as const;

export function parseBookPath(name: string): BookPath | null {
  const guide = GUIDEME_PATH.exec(name);
  if (guide) {
    const [, namespace, book, rest] = guide;
    const localized = /^_([a-z]{2,3}_[a-z]{2,4})\/(.+)$/.exec(rest);
    return {
      format: "guideme",
      namespace,
      book,
      part: "entries",
      path: localized ? localized[2] : rest,
      locale: localized ? localized[1] : null,
    };
  }
  const lavender = LAVENDER_PATH.exec(name);
  if (lavender) {
    const [, namespace, part, book, rest] = lavender;
    const slash = rest.indexOf("/");
    const first = slash > 0 ? rest.slice(0, slash) : "";
    const localized = LOCALE.test(first);
    return {
      format: "lavender",
      namespace,
      book,
      part: part as BookPart,
      path: localized ? rest.slice(slash + 1) : rest,
      locale: localized ? first : null,
    };
  }
  const patchouli = PATCHOULI_PATH.exec(name);
  if (patchouli) {
    const [, namespace, book, locale, part, rest] = patchouli;
    return {
      format: "patchouli",
      namespace,
      book,
      part: part as BookPart,
      path: rest,
      locale,
    };
  }
  return null;
}

export function parsePatchouliBookJson(
  name: string,
  data: Buffer,
): string | null {
  const match = PATCHOULI_BOOK.exec(name);
  if (!match) return null;
  let json: unknown;
  try {
    json = lenientJson(data.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
  const i18n = (json as { i18n?: unknown } | null)?.i18n === true;
  return i18n ? bookKey("patchouli", match[1], match[2]) : null;
}

export function isSourceBookPath(path: BookPath): boolean {
  if (path.format === "guideme") return path.locale === null;
  return path.format === "lavender"
    ? path.locale === null || path.locale === SOURCE_BOOK_LOCALE
    : path.locale === SOURCE_BOOK_LOCALE;
}

export function bookKey(
  format: BookFormat,
  namespace: string,
  book: string,
): string {
  return `${format}:${namespace}:${book}`;
}

export function docId(doc: Omit<BookPath, "locale"> | BookDoc): string {
  return `${bookKey(doc.format, doc.namespace, doc.book)}:${doc.part}/${doc.path}`;
}

function docPrefix(doc: BookDoc): string {
  return `${doc.part}/${doc.path}`;
}

export const EXTERNAL_PATCHOULI_DIR = "patchouli_books";
export const EXTERNAL_PATCHOULI_NAMESPACE = "patchouli_external";

export function docOutputPath(doc: BookDoc, locale: string): string {
  if (doc.external) {
    return `${EXTERNAL_PATCHOULI_DIR}/${doc.book}/${locale}/${doc.part}/${doc.path}`;
  }
  if (doc.format === "guideme") {
    return `assets/${doc.namespace}/${doc.book}/_${locale}/${doc.path}`;
  }
  return doc.format === "lavender"
    ? `assets/${doc.namespace}/lavender/${doc.part}/${doc.book}/${locale}/${doc.path}`
    : `assets/${doc.namespace}/patchouli_books/${doc.book}/${locale}/${doc.part}/${doc.path}`;
}

function worthTranslating(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_SEGMENT_CHARS &&
    !LANG_KEY.test(value.trim()) &&
    needsTranslation(value)
  );
}

function structuralLine(line: string): boolean {
  const text = line.trim();
  return (
    !text ||
    /^;{3,}$/.test(text) ||
    /^(?:-{3,}|\*{3,}|_{3,})$/.test(text) ||
    /^(?:<[^<>]*>\s*)+$/.test(text) ||
    /^!\[[^\]]*\]\([^)]*\)$/.test(text)
  );
}

interface LavenderParts {
  prefix: string;
  meta: string | null;
  suffix: string;
  eol: string;
  lines: string[];
  runs: Array<{ start: number; end: number }>;
}

function guideStructure(lines: string[]): boolean[] {
  let fence = false;
  let tag = false;
  return lines.map((line) => {
    const text = line.trim();
    if (/^(```|~~~)/.test(text)) {
      fence = !fence;
      return true;
    }
    if (fence) return true;
    if (tag) {
      if (text.includes(">")) tag = false;
      return true;
    }
    if (text.startsWith("<") && !text.includes(">")) {
      tag = true;
      return true;
    }
    return text.startsWith("|") || /^\{\/\*/.test(text) || structuralLine(line);
  });
}

function lavenderParts(text: string, format: BookFormat = "lavender"): LavenderParts {
  const front = (format === "guideme" ? YAML_FRONTMATTER : FRONTMATTER).exec(text);
  const body = front ? text.slice(front[0].length) : text;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r?\n/);
  const structural =
    format === "guideme" ? guideStructure(lines) : lines.map((line) => structuralLine(line));
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;
  lines.forEach((_line, index) => {
    if (structural[index]) {
      if (start >= 0) runs.push({ start, end: index });
      start = -1;
    } else if (start < 0) {
      start = index;
    }
  });
  if (start >= 0) runs.push({ start, end: lines.length });
  return {
    prefix: front?.[1] ?? "",
    meta: front?.[2] ?? null,
    suffix: front?.[3] ?? "",
    eol,
    lines,
    runs,
  };
}

function yamlScalar(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (value.startsWith("'")) {
    return value.length > 1 && value.endsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : null;
  }
  return value.replace(/\s+#.*$/, "");
}

function metaTitle(meta: string | null, format: BookFormat = "lavender"): string | null {
  if (format === "guideme") {
    const match = meta ? YAML_TITLE.exec(meta) : null;
    return match ? yamlScalar(match[2]) : null;
  }
  const match = meta ? META_TITLE.exec(meta) : null;
  if (!match) return null;
  try {
    const value = JSON.parse(match[2]);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function runKey(index: number): string {
  return `#${String(index + 1).padStart(3, "0")}`;
}

function lavenderSegments(doc: BookDoc): LangEntries {
  const parts = lavenderParts(doc.text, doc.format);
  const prefix = docPrefix(doc);
  const entries: LangEntries = {};
  const title = metaTitle(parts.meta, doc.format);
  if (worthTranslating(title)) entries[`${prefix}#title`] = title;
  parts.runs.forEach((run, index) => {
    const text = parts.lines.slice(run.start, run.end).join("\n");
    if (worthTranslating(text)) entries[`${prefix}${runKey(index)}`] = text;
  });
  return entries;
}

function renderLavender(doc: BookDoc, translations: LangEntries): string {
  const parts = lavenderParts(doc.text, doc.format);
  const prefix = docPrefix(doc);
  let meta = parts.meta;
  const title = translations[`${prefix}#title`];
  if (meta !== null && title !== undefined) {
    meta = meta.replace(
      doc.format === "guideme" ? YAML_TITLE : META_TITLE,
      (_all, key: string) => `${key}${JSON.stringify(title)}`,
    );
  }
  const lines = [...parts.lines];
  for (let index = parts.runs.length - 1; index >= 0; index--) {
    const run = parts.runs[index];
    const text = translations[`${prefix}${runKey(index)}`];
    if (text === undefined) continue;
    lines.splice(run.start, run.end - run.start, ...text.split("\n"));
  }
  return `${parts.prefix}${meta ?? ""}${parts.suffix}${lines.join(parts.eol)}`;
}

type JsonPath = Array<string | number>;

function patchouliFields(json: unknown, part: BookPart): Array<[string, JsonPath]> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const root = json as Record<string, unknown>;
  const fields: Array<[string, JsonPath]> = [["#name", ["name"]]];
  if (part === "categories") {
    fields.push(["#description", ["description"]]);
    return fields;
  }
  const pages = Array.isArray(root.pages) ? root.pages : [];
  pages.forEach((page, index) => {
    const key = `#p${String(index + 1).padStart(3, "0")}`;
    if (typeof page === "string") {
      fields.push([key, ["pages", index]]);
      return;
    }
    if (!page || typeof page !== "object") return;
    for (const field of PAGE_FIELDS) {
      fields.push([`${key}.${field}`, ["pages", index, field]]);
    }
  });
  return fields;
}

function readPath(json: unknown, path: JsonPath): unknown {
  let current: unknown = json;
  for (const step of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[step];
  }
  return current;
}

function writePath(json: unknown, path: JsonPath, value: string): void {
  let current: unknown = json;
  for (const step of path.slice(0, -1)) {
    current = (current as Record<string | number, unknown>)[step];
  }
  (current as Record<string | number, unknown>)[path[path.length - 1]] = value;
}

function parseDocJson(text: string): unknown {
  try {
    return lenientJson(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function patchouliSegments(doc: BookDoc): LangEntries {
  const json = parseDocJson(doc.text);
  const prefix = docPrefix(doc);
  const entries: LangEntries = {};
  for (const [suffix, path] of patchouliFields(json, doc.part)) {
    const value = readPath(json, path);
    if (worthTranslating(value)) entries[`${prefix}${suffix}`] = value;
  }
  return entries;
}

function renderPatchouli(doc: BookDoc, translations: LangEntries): string {
  const json = parseDocJson(doc.text);
  const prefix = docPrefix(doc);
  for (const [suffix, path] of patchouliFields(json, doc.part)) {
    const text = translations[`${prefix}${suffix}`];
    if (text !== undefined && typeof readPath(json, path) === "string") {
      writePath(json, path, text);
    }
  }
  return `${JSON.stringify(json, null, 2)}\n`;
}

export function docSegments(doc: BookDoc): LangEntries {
  if (docPrefix(doc).length > MAX_KEY_CHARS) return {};
  return doc.format === "patchouli" ? patchouliSegments(doc) : lavenderSegments(doc);
}

export function renderDoc(doc: BookDoc, translations: LangEntries): string | null {
  const keys = Object.keys(docSegments(doc));
  if (!keys.some((key) => translations[key] !== undefined)) return null;
  return doc.format === "patchouli"
    ? renderPatchouli(doc, translations)
    : renderLavender(doc, translations);
}

export function installedBookFormats(
  namespaces: Iterable<string>,
): Set<BookFormat> {
  const present = new Set(namespaces);
  return new Set(BOOK_FORMATS.filter((format) => present.has(format)));
}

export function collectBookGroups(
  sources: BookSource[],
  translatedElsewhere: ReadonlySet<string> = new Set(),
  formats: ReadonlySet<BookFormat> = new Set(BOOK_FORMATS),
): BookGroup[] {
  const translated = new Set(translatedElsewhere);
  const i18n = new Set<string>();
  for (const source of sources) {
    for (const id of source.translatedDocs) translated.add(id);
    for (const key of source.patchouliI18n) i18n.add(key);
  }

  const docs = new Map<string, { doc: BookDoc; context?: ModContext }>();
  for (const source of sources) {
    for (const doc of source.books) {
      docs.set(docId(doc), { doc, context: source.context ?? undefined });
    }
  }

  const groups = new Map<string, BookGroup>();
  for (const [id, { doc, context }] of [...docs].sort(([a], [b]) => a.localeCompare(b))) {
    const key = bookKey(doc.format, doc.namespace, doc.book);
    if (!formats.has(doc.format) || translated.has(id) || i18n.has(key)) continue;
    if (Object.keys(docSegments(doc)).length === 0) continue;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        format: doc.format,
        namespace: doc.namespace,
        book: doc.book,
        ...(context ? { context } : {}),
        docs: [],
      };
      groups.set(key, group);
    }
    group.docs.push(doc);
  }
  return [...groups.values()];
}

export function planBookUnits(groups: BookGroup[]): PlannedBookUnit[] {
  const units: PlannedBookUnit[] = [];
  for (const group of groups) {
    let entries: LangEntries = {};
    let keys = 0;
    let chars = 0;
    const flush = () => {
      if (keys === 0) return;
      units.push({
        hash: unitHash(entries),
        namespace: group.namespace,
        book: group.key,
        entries,
        ...(group.context ? { context: group.context } : {}),
      });
      entries = {};
      keys = 0;
      chars = 0;
    };
    for (const doc of group.docs) {
      const segments = docSegments(doc);
      const size = Object.values(segments).reduce((sum, value) => sum + value.length, 0);
      const count = Object.keys(segments).length;
      if (keys > 0 && (keys + count > UNIT_MAX_KEYS || chars + size > UNIT_MAX_CHARS)) {
        flush();
      }
      Object.assign(entries, segments);
      keys += count;
      chars += size;
    }
    flush();
  }
  return units;
}

export interface BookFile {
  name: string;
  data: Buffer;
}

export function bookPackFiles(
  groups: BookGroup[],
  translations: ReadonlyMap<string, LangEntries>,
  locale: string,
  external = false,
): BookFile[] {
  const files: BookFile[] = [];
  for (const group of groups) {
    const translated = translations.get(group.key);
    if (!translated) continue;
    for (const doc of group.docs) {
      if (!!doc.external !== external) continue;
      const text = renderDoc(doc, translated);
      if (text === null) continue;
      files.push({ name: docOutputPath(doc, locale), data: Buffer.from(text, "utf8") });
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
