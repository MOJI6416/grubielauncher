import { IFilterGroup, Provider } from "@/types/ModManager";
import { ContentEntry } from "./entries";

export type LibraryFacet =
  | "update"
  | "disabled"
  | "client"
  | "server"
  | "curseforge"
  | "modrinth"
  | "local";

export const LIBRARY_FACETS: LibraryFacet[] = [
  "update",
  "disabled",
  "client",
  "server",
  "curseforge",
  "modrinth",
  "local",
];

export type LibraryFacetCounts = Record<LibraryFacet, number>;

export type LibrarySort = "name" | "nameDesc" | "size" | "update";

export const LIBRARY_SORTS: LibrarySort[] = [
  "name",
  "nameDesc",
  "size",
  "update",
];

export interface LibraryQuery {
  query: string;
  facets: LibraryFacet[];
  sort: LibrarySort;
}

function matchesFacet(
  entry: ContentEntry,
  facet: LibraryFacet,
  updatable: ReadonlySet<string>,
  disabled: ReadonlySet<string>,
): boolean {
  switch (facet) {
    case "update":
      return updatable.has(entry.key);
    case "disabled":
      return disabled.has(entry.key) || entry.markedDisabled;
    case "client":
      return entry.side === "client";
    case "server":
      return entry.side === "server";
    case "curseforge":
      return entry.provider === Provider.CURSEFORGE;
    case "modrinth":
      return entry.provider === Provider.MODRINTH;
    case "local":
      return (
        entry.provider === Provider.LOCAL || entry.provider === Provider.OTHER
      );
    default:
      return false;
  }
}

export function countLibraryFacets(
  entries: ContentEntry[],
  updatable: ReadonlySet<string>,
  disabled: ReadonlySet<string>,
): LibraryFacetCounts {
  const counts = {
    update: 0,
    disabled: 0,
    client: 0,
    server: 0,
    curseforge: 0,
    modrinth: 0,
    local: 0,
  } satisfies LibraryFacetCounts;

  for (const entry of entries) {
    for (const facet of LIBRARY_FACETS) {
      if (matchesFacet(entry, facet, updatable, disabled)) counts[facet] += 1;
    }
  }

  return counts;
}

export function matchesTextQuery(entry: ContentEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return (
    entry.title.toLowerCase().includes(needle) ||
    entry.description.toLowerCase().includes(needle) ||
    entry.fileName.toLowerCase().includes(needle)
  );
}

export function filterLibraryEntries(
  entries: ContentEntry[],
  query: LibraryQuery,
  updatable: ReadonlySet<string>,
  disabled: ReadonlySet<string>,
): ContentEntry[] {
  return entries.filter((entry) => {
    if (!matchesTextQuery(entry, query.query)) return false;

    for (const facet of query.facets) {
      if (!matchesFacet(entry, facet, updatable, disabled)) return false;
    }

    return true;
  });
}

export function sortLibraryEntries(
  entries: ContentEntry[],
  sort: LibrarySort,
  updatable: ReadonlySet<string>,
): ContentEntry[] {
  const byName = (a: ContentEntry, b: ContentEntry) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

  const sorted = [...entries];

  switch (sort) {
    case "nameDesc":
      sorted.sort((a, b) => byName(b, a));
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
