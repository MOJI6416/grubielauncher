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
}

const IGNORED_NAMESPACES = new Set(["minecraft", "realms"]);

export function modNamespaces(jars: NamespaceLang[][]): string[] {
  const names = new Set<string>();
  for (const jar of jars) {
    for (const lang of jar) {
      if (!IGNORED_NAMESPACES.has(lang.namespace)) names.add(lang.namespace);
    }
  }
  return [...names].sort();
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
      const hash = unitHash(entries);
      if (!units.has(hash)) {
        units.set(hash, {
          hash,
          namespace: lang.namespace,
          format: lang.format,
          entries,
          ...(lang.context ? { context: lang.context } : {}),
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
