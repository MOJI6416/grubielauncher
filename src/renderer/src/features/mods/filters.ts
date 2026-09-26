import { IFilterGroup, Provider } from "@/types/ModManager";
import { normalizeProjectTitle } from "@renderer/utilities/mod";
import { ContentEntry } from "./entries";
import { displayTitle } from "./titles";

export type LibraryFacet =
  | "update"
  | "disabled"
  | "duplicate"
  | "client"
  | "server"
  | "curseforge"
  | "modrinth"
  | "local"
  | "foreign";

export const LIBRARY_FACETS: LibraryFacet[] = [
  "update",
  "disabled",
  "duplicate",
  "client",
  "server",
  "curseforge",
  "modrinth",
  "local",
  "foreign",
];

export type LibraryFacetCounts = Record<LibraryFacet, number>;

export type LibrarySort = "name" | "nameDesc" | "recent" | "size" | "update";

export const LIBRARY_SORTS: LibrarySort[] = [
  "name",
  "nameDesc",
  "recent",
  "size",
  "update",
];

function isLocalProvider(provider: Provider): boolean {
  return provider === Provider.LOCAL || provider === Provider.OTHER;
}

export interface DuplicateMarks {
  all: Set<string>;
  extra: Set<string>;
  groups: number;
}

function fileKey(entry: ContentEntry): string {
  const name = entry.fileName.replace(/\.disabled$/i, "").toLowerCase();
  return name ? `${entry.projectType}|${name}` : "";
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function findDuplicates(
  entries: ContentEntry[],
  unavailable: ReadonlySet<string> = new Set(),
): DuplicateMarks {
  const live = entries.filter((entry) => !entry.pendingRemoved);
  const all = new Set<string>();
  const extra = new Set<string>();
  let groups = 0;

  const rank = (entry: ContentEntry) =>
    isLocalProvider(entry.provider) ? 2 : unavailable.has(entry.key) ? 1 : 0;

  const byFile = new Map<string, ContentEntry[]>();
  for (const entry of live) {
    const key = fileKey(entry);
    if (key) pushTo(byFile, key, entry);
  }

  for (const group of byFile.values()) {
    if (group.length < 2) continue;
    groups += 1;

    const keeper = group.reduce((best, entry) =>
      rank(entry) < rank(best) ? entry : best,
    );
    for (const entry of group) {
      if (entry === keeper) continue;
      all.add(entry.key);
      extra.add(entry.key);
    }
  }

  const byTitle = new Map<string, ContentEntry[]>();
  for (const entry of live) {
    if (extra.has(entry.key)) continue;
    const title = normalizeProjectTitle(entry.title);
    if (title) pushTo(byTitle, title, entry);
  }

  for (const group of byTitle.values()) {
    const catalog = group.filter((entry) => !isLocalProvider(entry.provider));
    if (catalog.length === 0) continue;

    const locals = group.filter((entry) => isLocalProvider(entry.provider));
    const providers = new Set(catalog.map((entry) => entry.provider));
    const isCrossCatalog = providers.size > 1;
    if (locals.length === 0 && !isCrossCatalog) continue;

    groups += 1;
    for (const entry of locals) {
      all.add(entry.key);
      extra.add(entry.key);
    }
    if (isCrossCatalog) {
      for (const entry of catalog) all.add(entry.key);
    }
  }

  return { all, extra, groups };
}

export interface LibraryQuery {
  query: string;
  facets: LibraryFacet[];
  sort: LibrarySort;
}

export interface LibraryMarks {
  updatable: ReadonlySet<string>;
  disabled: ReadonlySet<string>;
  duplicates?: ReadonlySet<string>;
  foreign?: ReadonlySet<string>;
}

function matchesFacet(
  entry: ContentEntry,
  facet: LibraryFacet,
  marks: LibraryMarks,
): boolean {
  switch (facet) {
    case "update":
      return marks.updatable.has(entry.key);
    case "disabled":
      return marks.disabled.has(entry.key) || entry.markedDisabled;
    case "duplicate":
      return marks.duplicates?.has(entry.key) === true;
    case "client":
      return entry.side === "client";
    case "server":
      return entry.side === "server";
    case "curseforge":
      return entry.provider === Provider.CURSEFORGE;
    case "modrinth":
      return entry.provider === Provider.MODRINTH;
    case "local":
      return isLocalProvider(entry.provider);
    case "foreign":
      return marks.foreign?.has(entry.key) === true;
    default:
      return false;
  }
}

export function countLibraryFacets(
  entries: ContentEntry[],
  marks: LibraryMarks,
): LibraryFacetCounts {
  const counts = {
    update: 0,
    disabled: 0,
    duplicate: 0,
    client: 0,
    server: 0,
    curseforge: 0,
    modrinth: 0,
    local: 0,
    foreign: 0,
  } satisfies LibraryFacetCounts;

  for (const entry of entries) {
    for (const facet of LIBRARY_FACETS) {
      if (matchesFacet(entry, facet, marks)) counts[facet] += 1;
    }
  }

  return counts;
}

export function matchesTextQuery(entry: ContentEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [entry.title, entry.description, entry.fileName].some(
    (value) =>
      typeof value === "string" && value.toLowerCase().includes(needle),
  );
}

export function filterLibraryEntries(
  entries: ContentEntry[],
  query: LibraryQuery,
  marks: LibraryMarks,
): ContentEntry[] {
  return entries.filter((entry) => {
    if (!matchesTextQuery(entry, query.query)) return false;

    for (const facet of query.facets) {
      if (!matchesFacet(entry, facet, marks)) return false;
    }

    return true;
  });
}

export function sortLibraryEntries(
  entries: ContentEntry[],
  sort: LibrarySort,
  updatable: ReadonlySet<string>,
  changedAt?: ReadonlyMap<string, number>,
): ContentEntry[] {
  const names = new Map(
    entries.map((entry) => [entry.key, displayTitle(entry.title)]),
  );
  const byName = (a: ContentEntry, b: ContentEntry) =>
    (names.get(a.key) ?? a.title).localeCompare(
      names.get(b.key) ?? b.title,
      undefined,
      { sensitivity: "base" },
    );

  const sorted = [...entries];

  switch (sort) {
    case "nameDesc":
      sorted.sort((a, b) => byName(b, a));
      break;
    case "recent":
      sorted.sort(
        (a, b) =>
          (changedAt?.get(b.key) ?? 0) - (changedAt?.get(a.key) ?? 0) ||
          byName(a, b),
      );
      break;
    case "size":
      sorted.sort((a, b) => b.size - a.size || byName(a, b));
      break;
    case "update":
      sorted.sort((a, b) => {
        const rank =
          Number(updatable.has(b.key)) - Number(updatable.has(a.key));
        return rank || byName(a, b);
      });
      break;
    default:
      sorted.sort(byName);
  }

  return sorted;
}

export function catalogFilterKey(
  item: { name: string; id?: string },
  provider: Provider,
): string {
  return provider === Provider.CURSEFORGE ? (item.id ?? item.name) : item.name;
}

export function humanizeFilterName(name: string): string {
  const spaced = name.replace(/[-_]+/g, " ").trim();
  if (!spaced) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function categoryLocaleKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `modManager.categories.${slug}`;
}

export function catalogFilterLabel(
  item: { name: string },
  provider: Provider,
  translate?: (key: string, fallback: string) => string,
): string {
  const fallback =
    provider === Provider.CURSEFORGE
      ? item.name
      : humanizeFilterName(item.name);

  if (!translate) return fallback;
  return translate(categoryLocaleKey(item.name), fallback);
}

export interface CatalogFilterChip {
  key: string;
  label: string;
  icon?: string;
}

export function buildCatalogChips(
  groups: IFilterGroup[],
  selected: string[],
  provider: Provider,
  translate?: (key: string, fallback: string) => string,
): CatalogFilterChip[] {
  const known = new Map<string, CatalogFilterChip>();

  for (const group of groups) {
    for (const item of group.items) {
      const key = catalogFilterKey(item, provider);
      known.set(key, {
        key,
        label: catalogFilterLabel(item, provider, translate),
        icon: item.icon,
      });
    }
  }

  return selected.map((key) => known.get(key) ?? { key, label: key });
}

export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}
