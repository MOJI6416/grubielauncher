import { IFilterGroup, Provider } from "@/types/ModManager";
import { normalizeProjectTitle } from "@renderer/utilities/mod";
import { ContentEntry } from "./entries";

export type LibraryFacet =
  | "update"
  | "disabled"
  | "duplicate"
  | "client"
  | "server"
  | "curseforge"
  | "modrinth"
  | "local";

export const LIBRARY_FACETS: LibraryFacet[] = [
  "update",
  "disabled",
  "duplicate",
  "client",
  "server",
  "curseforge",
  "modrinth",
  "local",
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

export function findLocalDuplicates(entries: ContentEntry[]): Set<string> {
  const catalogTitles = new Set<string>();
  for (const entry of entries) {
    if (isLocalProvider(entry.provider) || entry.pendingRemoved) continue;
    const title = normalizeProjectTitle(entry.title);
    if (title) catalogTitles.add(title);
  }

  const duplicates = new Set<string>();
  if (catalogTitles.size === 0) return duplicates;

  for (const entry of entries) {
    if (!isLocalProvider(entry.provider) || entry.pendingRemoved) continue;
    if (catalogTitles.has(normalizeProjectTitle(entry.title))) {
      duplicates.add(entry.key);
    }
  }

  return duplicates;
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
  const byName = (a: ContentEntry, b: ContentEntry) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

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
