import yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";
import { LangFormat, parseLangFile, parseLangPath } from "./langFiles";
import type { LangEntries } from "./unitHash";

export const SOURCE_LOCALE = "en_us";

const MAX_LANG_BYTES = 8 * 1024 * 1024;
const MAX_NESTED_JAR_BYTES = 48 * 1024 * 1024;
const NESTED_JAR = /^META-INF\/(?:jars|jarjar)\/[^/]+\.jar$/i;

export interface NamespaceLang {
  namespace: string;
  format: LangFormat;
  english: LangEntries;
  translatedKeys: string[];
}

interface Collected {
  format: LangFormat;
  english: LangEntries | null;
  translated: Set<string>;
}

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

async function walk(
  zip: ZipFile,
  visit: (name: string, entry: Entry) => Promise<void>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let failed = false;
    zip.on("entry", (entry: Entry) => {
      visit(entryName(entry), entry)
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

async function collect(
  zip: ZipFile,
  targetLocale: string,
  byNamespace: Map<string, Collected>,
  nested: boolean,
): Promise<void> {
  const nestedJars: Buffer[] = [];

  await walk(zip, async (name, entry) => {
    if (name.endsWith("/")) return;

    if (
      !nested &&
      NESTED_JAR.test(name) &&
      entry.uncompressedSize <= MAX_NESTED_JAR_BYTES
    ) {
      nestedJars.push(await readEntry(zip, entry));
      return;
    }

    const langPath = parseLangPath(name);
    if (!langPath || entry.uncompressedSize > MAX_LANG_BYTES) return;
    if (langPath.locale !== SOURCE_LOCALE && langPath.locale !== targetLocale) {
      return;
    }

    let entries: LangEntries;
    try {
      entries = parseLangFile(langPath.format, await readEntry(zip, entry));
    } catch {
      return;
    }

    const current = byNamespace.get(langPath.namespace) ?? {
      format: langPath.format,
      english: null,
      translated: new Set<string>(),
    };
    if (langPath.locale === SOURCE_LOCALE) {
      if (!current.english || langPath.format === "json") {
        current.english = { ...(current.english ?? {}), ...entries };
        current.format = langPath.format;
      }
    } else {
      for (const key of Object.keys(entries)) current.translated.add(key);
    }
    byNamespace.set(langPath.namespace, current);
  });

  for (const buffer of nestedJars) {
    let inner: ZipFile | null = null;
    try {
      inner = await openZip((callback) =>
        yauzl.fromBuffer(buffer, ZIP_OPTIONS, callback),
      );
      await collect(inner, targetLocale, byNamespace, true);
    } catch {
      continue;
    } finally {
      inner?.close();
    }
  }
}

export async function scanJarLang(
  jarPath: string,
  targetLocale: string,
): Promise<NamespaceLang[]> {
  const zip = await openZip((callback) =>
    yauzl.open(jarPath, ZIP_OPTIONS, callback),
  );
  const byNamespace = new Map<string, Collected>();
  try {
    await collect(zip, targetLocale, byNamespace, false);
  } finally {
    zip.close();
  }

  const result: NamespaceLang[] = [];
  for (const [namespace, collected] of byNamespace) {
    if (!collected.english || Object.keys(collected.english).length === 0) {
      continue;
    }
    result.push({
      namespace,
      format: collected.format,
      english: collected.english,
      translatedKeys: [...collected.translated],
    });
  }
  return result.sort((a, b) => a.namespace.localeCompare(b.namespace));
}

export async function scanPackKeys(
  packPath: string,
  targetLocale: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const zip = await openZip((callback) =>
    yauzl.open(packPath, ZIP_OPTIONS, callback),
  );
  try {
    await walk(zip, async (name, entry) => {
      const langPath = parseLangPath(name);
      if (!langPath || langPath.locale !== targetLocale) return;
      if (entry.uncompressedSize > MAX_LANG_BYTES) return;
      try {
        const entries = parseLangFile(
          langPath.format,
          await readEntry(zip, entry),
        );
        for (const key of Object.keys(entries)) keys.add(key);
      } catch {
        return;
      }
    });
  } finally {
    zip.close();
  }
  return keys;
}
