import { createHash } from "crypto";
import type { NamespaceLang } from "./jarScan";
import { LangFormat, langFileName, serializeLangFile } from "./langFiles";
import type { ModContext } from "./modContext";
import { LangEntries, needsTranslation, unitHash } from "./unitHash";

export interface PlannedUnit {
  hash: string;
  namespace: string;
  format: LangFormat;
  entries: LangEntries;
  context?: ModContext;
  origin?: "pack" | "quests";
}

const IGNORED_NAMESPACES = new Set(["minecraft", "realms"]);
const UNIT_MAX_KEYS = 6000;
const UNIT_MAX_CHARS = 600_000;
const PART_KEYS = 4000;
const PART_CHARS = 250_000;

export function splitUnitEntries(entries: LangEntries): LangEntries[] {
  const keys = Object.keys(entries);
  const chars = keys.reduce((sum, key) => sum + entries[key].length, 0);
  if (keys.length <= UNIT_MAX_KEYS && chars <= UNIT_MAX_CHARS) return [entries];
  const parts = Math.max(Math.ceil(keys.length / PART_KEYS), Math.ceil(chars / PART_CHARS));
  const buckets: LangEntries[] = Array.from({ length: parts }, () => ({}));
  for (const key of keys) {
    const bucket = createHash("sha1").update(key).digest().readUInt32BE(0) % parts;
    buckets[bucket][key] = entries[key];
  }
  return buckets.filter((bucket) => Object.keys(bucket).length > 0);
}

export function modNamespaces(jars: NamespaceLang[][]): string[] {
  const names = new Set<string>();
  for (const jar of jars) {
    for (const lang of jar) {
      if (!IGNORED_NAMESPACES.has(lang.namespace)) names.add(lang.namespace);
    }
  }
  return [...names].sort();
}

export function preferPackEnglish(
  sources: NamespaceLang[][],
): NamespaceLang[][] {
  const overridden = new Set<string>();
  for (const source of sources) {
    for (const lang of source) {
      if (lang.origin !== "pack") continue;
      for (const key of Object.keys(lang.english)) overridden.add(key);
    }
  }
  if (overridden.size === 0) return sources;
  return sources.map((source) =>
    source.map((lang) =>
      lang.origin === "pack"
        ? lang
        : {
            ...lang,
            english: Object.fromEntries(
              Object.entries(lang.english).filter(([key]) => !overridden.has(key)),
            ),
          },
    ),
  );
}

export function planUnits(
  jars: NamespaceLang[][],
  coveredByPacks: ReadonlySet<string>,
): PlannedUnit[] {
  const translated = new Set<string>(coveredByPacks);
  for (const jar of jars) {
    for (const lang of jar) {
      for (const key of lang.translatedKeys) translated.add(key);
    }
  }

  const units = new Map<string, PlannedUnit>();
  for (const jar of jars) {
    for (const lang of jar) {
      if (IGNORED_NAMESPACES.has(lang.namespace)) continue;
      const entries: LangEntries = {};
      for (const [key, value] of Object.entries(lang.english)) {
        if (!translated.has(key) && needsTranslation(value)) {
          entries[key] = value;
        }
      }
      if (Object.keys(entries).length === 0) continue;
      for (const part of splitUnitEntries(entries)) {
        const hash = unitHash(part);
        if (units.has(hash)) continue;
        units.set(hash, {
          hash,
          namespace: lang.namespace,
          format: lang.format,
          entries: part,
          ...(lang.context ? { context: lang.context } : {}),
          ...(lang.origin ? { origin: lang.origin } : {}),
        });
      }
    }
  }

  return [...units.values()].sort((a, b) =>
    a.namespace === b.namespace
      ? a.hash.localeCompare(b.hash)
      : a.namespace.localeCompare(b.namespace),
  );
}

export interface PackFile {
  name: string;
  data: Buffer;
}

export function translationPackFiles(
  units: Array<{ namespace: string; entries: LangEntries }>,
  locale: string,
  mcVersion: string,
  format: LangFormat,
): PackFile[] {
  const byNamespace = new Map<string, LangEntries>();
  for (const unit of [...units].sort((a, b) =>
    a.namespace.localeCompare(b.namespace),
  )) {
    const merged = byNamespace.get(unit.namespace) ?? {};
    Object.assign(merged, unit.entries);
    byNamespace.set(unit.namespace, merged);
  }

  const fileName = langFileName(locale, format, mcVersion);
  return [...byNamespace.entries()]
    .filter(([, entries]) => Object.keys(entries).length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([namespace, entries]) => ({
      name: `assets/${namespace}/lang/${fileName}`,
      data: serializeLangFile(format, entries),
    }));
}

export function chunkBySize<T>(
  items: T[],
  maxItems: number,
  maxSize: number,
  sizeOf: (item: T) => number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const item of items) {
    const itemSize = sizeOf(item);
    if (
      current.length > 0 &&
      (current.length >= maxItems || size + itemSize > maxSize)
    ) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += itemSize;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
