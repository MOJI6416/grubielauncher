import type {
  ExploreSort,
  IExploreFacets,
  IExploreQuery,
  IModpackCard,
} from "@/types/Backend";
import type { ConnectivityProblem } from "@renderer/utilities/connectivity";

export const EXPLORE_PAGE_SIZE = 24;

export const EXPLORE_SORTS: ExploreSort[] = ["downloads", "updated", "new"];

export interface ExploreFilters {
  query: string;
  loader: string;
  mc: string;
  sort: ExploreSort;
}

export const EMPTY_FILTERS: ExploreFilters = {
  query: "",
  loader: "",
  mc: "",
  sort: "downloads",
};

export const EMPTY_FACETS: IExploreFacets = {
  loaders: [],
  minecraftVersions: [],
};

export function exploreRequest(
  filters: ExploreFilters,
  offset: number,
): IExploreQuery {
  return {
    offset,
    limit: EXPLORE_PAGE_SIZE,
    sort: filters.sort,
    q: filters.query.trim().slice(0, 64),
    loader: filters.loader,
    mc: filters.mc,
  };
}

export function exploreSignature(filters: ExploreFilters): string {
  return [
    filters.query.trim().toLowerCase(),
    filters.loader,
    filters.mc,
    filters.sort,
  ].join("|");
}

export function mergeExplorePages(
  previous: IModpackCard[],
  next: IModpackCard[],
): IModpackCard[] {
  if (previous.length === 0) return next;

  const seen = new Set(previous.map((item) => item.id));
  const added = next.filter((item) => !seen.has(item.id));

  return added.length === 0 ? previous : [...previous, ...added];
}

export function hasMoreExplore({
  loaded,
  total,
  received,
  added,
}: {
  loaded: number;
  total: number;
  received: number;
  added: number;
}): boolean {
  if (received === 0 || added === 0) return false;
  if (received < EXPLORE_PAGE_SIZE) return false;

  return loaded > 0 && loaded < total;
}

export function normalizeFacets(
  facets: IExploreFacets | undefined | null,
): IExploreFacets {
  if (!facets) return EMPTY_FACETS;

  return {
    loaders: (facets.loaders ?? []).filter(
      (entry) => typeof entry?.name === "string" && entry.name !== "",
    ),
    minecraftVersions: (facets.minecraftVersions ?? []).filter(
      (entry) => typeof entry?.version === "string" && entry.version !== "",
    ),
  };
}

export function loaderFacetOptions(
  facets: IExploreFacets,
): { value: string; count: number }[] {
  return [...normalizeFacets(facets).loaders]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((entry) => ({ value: entry.name, count: entry.count }));
}

export function versionFacetOptions(
  facets: IExploreFacets,
): { value: string; count: number }[] {
  return normalizeFacets(facets).minecraftVersions.map((entry) => ({
    value: entry.version,
    count: entry.count,
  }));
}

export function withFacetSelection(
  filters: ExploreFilters,
  patch: Partial<ExploreFilters>,
): ExploreFilters {
  return { ...filters, ...patch };
}

export function isFilterActive(filters: ExploreFilters): boolean {
  return (
    filters.query.trim() !== "" || filters.loader !== "" || filters.mc !== ""
  );
}

export function areFacetCountsExact(
  filters: ExploreFilters,
  facet: "loader" | "mc",
): boolean {
  if (filters.query.trim() !== "") return false;

  return facet === "loader" ? filters.mc === "" : filters.loader === "";
}

export type CatalogEmptyAction =
  | "retryConnection"
  | "retryLoad"
  | "resetFilters"
  | "none";

export interface CatalogEmptyState {
  titleKey: string;
  hintKey: string;
  action: CatalogEmptyAction;
}

export function catalogEmptyState({
  offlineProblem,
  hasError,
  filters,
}: {
  offlineProblem: ConnectivityProblem | null;
  hasError: boolean;
  filters: ExploreFilters;
}): CatalogEmptyState {
  if (offlineProblem) {
    return {
      titleKey: `shell.offline.${offlineProblem}`,
      hintKey:
        offlineProblem === "internet"
          ? "app.internetUnavailable"
          : "community.loadFailed",
      action: "retryConnection",
    };
  }

  if (hasError) {
    return {
      titleKey: "community.loadFailedTitle",
      hintKey: "community.loadFailed",
      action: "retryLoad",
    };
  }

  if (isFilterActive(filters)) {
    return {
      titleKey: "common.notFound",
      hintKey:
        filters.query.trim() === ""
          ? "community.notFoundFiltersHint"
          : "community.notFoundHint",
      action: "resetFilters",
    };
  }

  return {
    titleKey: "community.emptyTitle",
    hintKey: "community.emptyHint",
    action: "none",
  };
}

export type PackContentKey = "mods" | "servers";

export function packContentParts(
  summary: IModpackCard["summary"] | undefined,
): { key: PackContentKey; value: number }[] {
  if (!summary) return [];

  return (["mods", "servers"] as const)
    .map((key) => ({ key, value: Number(summary[key]) || 0 }))
    .filter((part) => part.value > 0);
}
