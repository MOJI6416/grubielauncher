import path from "path";
import fs from "fs-extra";
import yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";
import {
  BookDoc,
  docId,
  EXTERNAL_PATCHOULI_DIR,
  EXTERNAL_PATCHOULI_NAMESPACE,
  isSourceBookPath,
  MAX_BOOK_BYTES,
  parseBookPath,
  parsePatchouliBookJson,
} from "./books";
import { LangFormat, parseLangFile, parseLangPath } from "./langFiles";
import {
  MOD_METADATA_FILES,
  ModContext,
  preferredContext,
  readModContext,
} from "./modContext";
import type { LangEntries } from "./unitHash";

export const SOURCE_LOCALE = "en_us";

const MAX_LANG_BYTES = 8 * 1024 * 1024;
const MAX_NESTED_JAR_BYTES = 48 * 1024 * 1024;
const MAX_META_BYTES = 256 * 1024;
const NESTED_JAR = /^META-INF\/(?:jars|jarjar)\/[^/]+\.jar$/i;
const DIRECTORY_ROOTS = ["assets", "data"];
const METADATA = new Set<string>(MOD_METADATA_FILES);

export interface NamespaceLang {
  namespace: string;
  format: LangFormat;
  english: LangEntries;
  translatedKeys: string[];
  context?: ModContext;
  origin?: "pack" | "quests";
}

export interface SourceScan {
  context: ModContext | null;
  namespaces: NamespaceLang[];
  books: BookDoc[];
  translatedDocs: string[];
  patchouliI18n: string[];
}

export interface PackCoverage {
  keys: Set<string>;
  docs: Set<string>;
}

interface Collected {
  format: LangFormat;
  english: LangEntries | null;
  translated: Set<string>;
  context?: ModContext;
}

interface ScanState {
  locale: string;
  namespaces: Map<string, Collected>;
  books: Map<string, { doc: BookDoc; root: boolean }>;
  translatedDocs: Set<string>;
  patchouliI18n: Set<string>;
}

type Read = () => Promise<Buffer>;
type Visit = (name: string, size: number, read: Read) => Promise<void>;
type Walker = (visit: Visit) => Promise<void>;
type ZipOpener = (callback: (error: Error | null, zip?: ZipFile) => void) => void;

const ZIP_OPTIONS = {
  lazyEntries: true,
  autoClose: false,
  decodeStrings: false,
  validateEntrySizes: true,
} as const;

function openZip(open: ZipOpener): Promise<ZipFile> {
  return new Promise((resolve, reject) =>
    open((error, zip) =>
      error || !zip ? reject(error ?? new Error("Cannot open zip")) : resolve(zip),
    ),
  );
}

function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Cannot read zip entry"));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

function entryName(entry: Entry): string {
  return (entry.fileName as unknown as Buffer)
    .toString("utf8")
    .replace(/\\/g, "/");
}

function zipWalker(zip: ZipFile): Walker {
  return (visit) =>
    new Promise<void>((resolve, reject) => {
      let failed = false;
      zip.on("entry", (entry: Entry) => {
        const name = entryName(entry);
        const task = name.endsWith("/")
          ? Promise.resolve()
          : visit(name, entry.uncompressedSize, () => readEntry(zip, entry));
        task
          .then(() => zip.readEntry())
          .catch((error) => {
            failed = true;
            reject(error);
          });
      });
      zip.on("end", () => {
        if (!failed) resolve();
      });
      zip.on("error", reject);
      zip.readEntry();
    });
}

async function listDirectory(
  root: string,
  relative: string,
  out: Array<{ name: string; file: string; size: number; mtimeMs: number }>,
): Promise<void> {
  const entries = await fs
    .readdir(path.join(root, relative), { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await listDirectory(root, name, out);
    } else if (entry.isFile()) {
      const file = path.join(root, name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat) out.push({ name, file, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
}

export async function directoryFiles(
  root: string,
): Promise<Array<{ name: string; file: string; size: number; mtimeMs: number }>> {
  const files: Array<{ name: string; file: string; size: number; mtimeMs: number }> = [];
  for (const top of DIRECTORY_ROOTS) await listDirectory(root, top, files);
  const mcmeta = path.join(root, "pack.mcmeta");
  const stat = await fs.stat(mcmeta).catch(() => null);
  if (stat?.isFile()) {
    files.push({ name: "pack.mcmeta", file: mcmeta, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

function directoryWalker(root: string): Walker {
  return async (visit) => {
    for (const file of await directoryFiles(root)) {
      await visit(file.name, file.size, () => fs.readFile(file.file));
    }
  };
}

function packContext(data: Buffer): ModContext | null {
  let json: unknown;
  try {
    json = JSON.parse(data.toString("utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
  const description = (json as { pack?: { description?: unknown } } | null)?.pack
    ?.description;
  const text = (value: unknown): string =>
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.map(text).join("")
        : value && typeof value === "object"
          ? text((value as { text?: unknown }).text)
          : "";
  const name = text(description)
    .replace(/§[0-9a-fk-or]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return name ? { name } : null;
}

async function collect(
  walker: Walker,
  state: ScanState,
  nested: boolean,
  isPack = false,
): Promise<ModContext | null> {
  const nestedJars: Buffer[] = [];
  const metadata = new Map<string, ModContext>();
  const created: string[] = [];
  let pack: ModContext | null = null;

  await walker(async (name, size, read) => {
    if (!nested && NESTED_JAR.test(name) && size <= MAX_NESTED_JAR_BYTES) {
      nestedJars.push(await read());
      return;
    }

    if (METADATA.has(name) && size <= MAX_META_BYTES) {
      const context = readModContext(name, await read());
      if (context) metadata.set(name, context);
      return;
    }

    if (name === "pack.mcmeta" && size <= MAX_META_BYTES) {
      pack = packContext(await read());
      return;
    }

    const bookPath = parseBookPath(name);
    if (bookPath) {
      if (size > MAX_BOOK_BYTES) return;
      if (bookPath.locale === state.locale) {
        state.translatedDocs.add(docId(bookPath));
        return;
      }
      if (!isSourceBookPath(bookPath)) return;
      const root = bookPath.locale === null;
      const id = docId(bookPath);
      const known = state.books.get(id);
      if (known?.root && !root) return;
      state.books.set(id, {
        doc: {
          format: bookPath.format,
          namespace: bookPath.namespace,
          book: bookPath.book,
          part: bookPath.part,
          path: bookPath.path,
          text: (await read()).toString("utf8"),
        },
        root,
      });
      return;
    }

    if (name.endsWith("/book.json") && size <= MAX_META_BYTES) {
      const i18n = parsePatchouliBookJson(name, await read());
      if (i18n) state.patchouliI18n.add(i18n);
      return;
    }

    const langPath = parseLangPath(name);
    if (!langPath || size > MAX_LANG_BYTES) return;
    if (langPath.locale !== SOURCE_LOCALE && langPath.locale !== state.locale) {
      return;
    }

    let entries: LangEntries;
    try {
      entries = parseLangFile(langPath.format, await read());
    } catch {
      return;
    }

    let current = state.namespaces.get(langPath.namespace);
    if (!current) {
      current = { format: langPath.format, english: null, translated: new Set() };
      state.namespaces.set(langPath.namespace, current);
      created.push(langPath.namespace);
    }
    if (langPath.locale === SOURCE_LOCALE) {
      if (!current.english || langPath.format === "json") {
        current.english = { ...(current.english ?? {}), ...entries };
        current.format = langPath.format;
      }
    } else {
      for (const key of Object.keys(entries)) current.translated.add(key);
    }
  });

  const context =
    preferredContext(metadata) ?? (isPack ? (pack as ModContext | null) : null);
  if (context) {
    for (const namespace of created) {
      const collected = state.namespaces.get(namespace);
      if (collected && !collected.context) collected.context = context;
    }
  }

  for (const buffer of nestedJars) {
    let inner: ZipFile | null = null;
    try {
      inner = await openZip((callback) =>
        yauzl.fromBuffer(buffer, ZIP_OPTIONS, callback),
      );
      await collect(zipWalker(inner), state, true);
    } catch {
      continue;
    } finally {
      inner?.close();
    }
  }

  if (context && !nested) {
    for (const collected of state.namespaces.values()) {
      if (!collected.context) collected.context = context;
    }
  }
  return context;
}

function emptyState(locale: string): ScanState {
  return {
    locale,
    namespaces: new Map(),
    books: new Map(),
    translatedDocs: new Set(),
    patchouliI18n: new Set(),
  };
}

function finish(state: ScanState, context: ModContext | null): SourceScan {
  const namespaces: NamespaceLang[] = [];
  for (const [namespace, collected] of state.namespaces) {
    if (!collected.english || Object.keys(collected.english).length === 0) {
      continue;
    }
    namespaces.push({
      namespace,
      format: collected.format,
      english: collected.english,
      translatedKeys: [...collected.translated],
      ...(collected.context ? { context: collected.context } : {}),
    });
  }
  return {
    context,
    namespaces: namespaces.sort((a, b) => a.namespace.localeCompare(b.namespace)),
    books: [...state.books.values()]
      .map((entry) => entry.doc)
      .sort((a, b) => docId(a).localeCompare(docId(b))),
    translatedDocs: [...state.translatedDocs].sort(),
    patchouliI18n: [...state.patchouliI18n].sort(),
  };
}

export async function scanSource(
  sourcePath: string,
  targetLocale: string,
): Promise<SourceScan> {
  const state = emptyState(targetLocale);
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    return finish(
      state,
      await collect(directoryWalker(sourcePath), state, true, true),
    );
  }
  const zip = await openZip((callback) =>
    yauzl.open(sourcePath, ZIP_OPTIONS, callback),
  );
  try {
    return finish(
      state,
      await collect(
        zipWalker(zip),
        state,
        false,
        !sourcePath.toLowerCase().endsWith(".jar"),
      ),
    );
  } finally {
    zip.close();
  }
}

async function externalBookFiles(
  root: string,
  relative: string,
  out: Array<{ name: string; file: string; size: number }>,
): Promise<void> {
  const entries = await fs
    .readdir(path.join(root, relative), { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await externalBookFiles(root, name, out);
    } else if (entry.isFile() && name.endsWith(".json")) {
      const file = path.join(root, name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat) out.push({ name, file, size: stat.size });
    }
  }
}

const EXTERNAL_DOC =
  /^([a-z0-9_.-]+)\/([a-z]{2,3}_[a-z]{2,4})\/(entries|categories)\/(.+\.json)$/;

export async function scanExternalPatchouli(
  versionPath: string,
  targetLocale: string,
): Promise<SourceScan> {
  const root = path.join(versionPath, EXTERNAL_PATCHOULI_DIR);
  const files: Array<{ name: string; file: string; size: number }> = [];
  await externalBookFiles(root, "", files);
  const scan: SourceScan = {
    context: null,
    namespaces: [],
    books: [],
    translatedDocs: [],
    patchouliI18n: [],
  };
  for (const { name, file, size } of files.sort((a, b) => a.name.localeCompare(b.name))) {
    if (size > MAX_BOOK_BYTES) continue;
    const bookJson = /^([a-z0-9_.-]+)\/book\.json$/.exec(name);
    if (bookJson) {
      const i18n = parsePatchouliBookJson(
        `data/${EXTERNAL_PATCHOULI_NAMESPACE}/patchouli_books/${bookJson[1]}/book.json`,
        await fs.readFile(file),
      );
      if (i18n) scan.patchouliI18n.push(i18n);
      continue;
    }
    const match = EXTERNAL_DOC.exec(name);
    if (!match) continue;
    const doc = {
      format: "patchouli" as const,
      namespace: EXTERNAL_PATCHOULI_NAMESPACE,
      book: match[1],
      part: match[3] as BookDoc["part"],
      path: match[4],
    };
    if (match[2] === targetLocale) {
      scan.translatedDocs.push(docId(doc));
    } else if (match[2] === SOURCE_LOCALE) {
      scan.books.push({ ...doc, text: await fs.readFile(file, "utf8"), external: true });
    }
  }
  return scan;
}

export async function scanPackCoverage(
  packPath: string,
  targetLocale: string,
): Promise<PackCoverage> {
  const coverage: PackCoverage = { keys: new Set(), docs: new Set() };
  const zip = await openZip((callback) =>
    yauzl.open(packPath, ZIP_OPTIONS, callback),
  );
  try {
    await zipWalker(zip)(async (name, size, read) => {
      const bookPath = parseBookPath(name);
      if (bookPath) {
        if (bookPath.locale === targetLocale) coverage.docs.add(docId(bookPath));
        return;
      }
      const langPath = parseLangPath(name);
      if (!langPath || langPath.locale !== targetLocale) return;
      if (size > MAX_LANG_BYTES) return;
      try {
        const entries = parseLangFile(langPath.format, await read());
        for (const key of Object.keys(entries)) coverage.keys.add(key);
      } catch {
        return;
      }
    });
  } finally {
    zip.close();
  }
  return coverage;
}
