import { describe, expect, it } from "vitest";
import type { IExploreFacets, IModpackCard } from "@/types/Backend";
import {
  areFacetCountsExact,
  catalogEmptyState,
  EMPTY_FILTERS,
  EXPLORE_PAGE_SIZE,
  exploreRequest,
  exploreSignature,
  hasMoreExplore,
  isFilterActive,
  loaderFacetOptions,
  mergeExplorePages,
  normalizeFacets,
  packContentParts,
  versionFacetOptions,
} from "./exploreQuery";

function card(id: string): IModpackCard {
  return {
    id,
    name: id,
    description: "",
    imageUrl: "",
    downloads: 0,
    build: 0,
    createdAt: "",
    lastUpdate: "",
    minecraftVersion: "1.21.1",
    loader: { name: "fabric", version: "" },
    owner: { nickname: "someone", imageUrl: "" },
    summary: { mods: 0, servers: 0, otherFiles: 0 },
  };
}

describe("exploreRequest", () => {
  it("carries filters and trims the search text", () => {
    expect(
      exploreRequest(
        { query: "  tanks  ", loader: "neoforge", mc: "1.21.1", sort: "new" },
        48,
      ),
    ).toEqual({
      offset: 48,
      limit: EXPLORE_PAGE_SIZE,
      sort: "new",
      q: "tanks",
      loader: "neoforge",
      mc: "1.21.1",
    });
  });

  it("caps the search text at the length the server accepts", () => {
    const request = exploreRequest(
      { ...EMPTY_FILTERS, query: "x".repeat(200) },
      0,
    );

    expect(request.q).toHaveLength(64);
  });
});

describe("exploreSignature", () => {
  it("ignores case and padding of the search text", () => {
    expect(exploreSignature({ ...EMPTY_FILTERS, query: " Vanilla " })).toBe(
      exploreSignature({ ...EMPTY_FILTERS, query: "vanilla" }),
    );
  });

  it("separates different sorts", () => {
    expect(exploreSignature({ ...EMPTY_FILTERS, sort: "new" })).not.toBe(
      exploreSignature({ ...EMPTY_FILTERS, sort: "updated" }),
    );
  });
});

describe("mergeExplorePages", () => {
  it("appends the next page", () => {
    const merged = mergeExplorePages([card("a")], [card("b")]);
    expect(merged.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("drops ids already loaded", () => {
    const merged = mergeExplorePages([card("a")], [card("a"), card("b")]);
    expect(merged.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("keeps the same array when the page adds nothing", () => {
    const previous = [card("a")];
    expect(mergeExplorePages(previous, [card("a")])).toBe(previous);
  });
});

describe("hasMoreExplore", () => {
  const page = {
    loaded: EXPLORE_PAGE_SIZE,
    total: 40,
    received: EXPLORE_PAGE_SIZE,
    added: EXPLORE_PAGE_SIZE,
  };

  it("is false for an empty and for a complete list", () => {
    expect(hasMoreExplore({ ...page, loaded: 0, received: 0, added: 0 })).toBe(
      false,
    );
    expect(hasMoreExplore({ loaded: 7, total: 7, received: 7, added: 7 })).toBe(
      false,
    );
  });

  it("is true while the server has rows left", () => {
    expect(hasMoreExplore(page)).toBe(true);
  });

  it("stops when a full page brought nothing new", () => {
    expect(hasMoreExplore({ ...page, added: 0 })).toBe(false);
  });

  it("stops on a short page even when the total says otherwise", () => {
    expect(hasMoreExplore({ ...page, loaded: 30, received: 6, added: 6 })).toBe(
      false,
    );
  });
});

describe("explore paging", () => {
  it("never loops when the server repeats a page", () => {
    const first = Array.from({ length: EXPLORE_PAGE_SIZE }, (_, index) =>
      card(`pack-${index}`),
    );
    const repeated = [...first];

    let items = mergeExplorePages([], first);
    let offset = first.length;
    let hasMore = hasMoreExplore({
      loaded: offset,
      total: 100,
      received: first.length,
      added: first.length,
    });
    expect(hasMore).toBe(true);

    const merged = mergeExplorePages(items, repeated);
    const added = merged.length - items.length;
    items = merged;
    offset += repeated.length;
    hasMore = hasMoreExplore({
      loaded: offset,
      total: 100,
      received: repeated.length,
      added,
    });

    expect(added).toBe(0);
    expect(items).toHaveLength(EXPLORE_PAGE_SIZE);
    expect(hasMore).toBe(false);
  });

  it("asks for the next page by the number of rows the server handed out", () => {
    const first = Array.from({ length: EXPLORE_PAGE_SIZE }, (_, index) =>
      card(`pack-${index}`),
    );
    const second = [
      card("pack-0"),
      ...Array.from({ length: 23 }, (_, index) => card(`next-${index}`)),
    ];

    const merged = mergeExplorePages(first, second);

    expect(merged).toHaveLength(EXPLORE_PAGE_SIZE + 23);
    expect(
      exploreRequest(EMPTY_FILTERS, first.length + second.length).offset,
    ).toBe(48);
  });
});

describe("areFacetCountsExact", () => {
  it("trusts the counts while nothing else narrows the catalog", () => {
    expect(areFacetCountsExact(EMPTY_FILTERS, "loader")).toBe(true);
    expect(areFacetCountsExact(EMPTY_FILTERS, "mc")).toBe(true);
  });

  it("keeps a facet exact while only that facet is chosen", () => {
    const filters = { ...EMPTY_FILTERS, loader: "fabric" };

    expect(areFacetCountsExact(filters, "loader")).toBe(true);
    expect(areFacetCountsExact(filters, "mc")).toBe(false);
  });

  it("drops both once a search narrows the catalog", () => {
    const filters = { ...EMPTY_FILTERS, query: " vanilla " };

    expect(areFacetCountsExact(filters, "loader")).toBe(false);
    expect(areFacetCountsExact(filters, "mc")).toBe(false);
  });
});

describe("catalogEmptyState", () => {
  const base = {
    offlineProblem: null,
    hasError: false,
    filters: EMPTY_FILTERS,
  };

  it("names the outage the top bar names, not a missing internet", () => {
    expect(catalogEmptyState({ ...base, offlineProblem: "backend" })).toEqual({
      titleKey: "shell.offline.backend",
      hintKey: "community.loadFailed",
      action: "retryConnection",
    });
  });

  it("blames the internet only when the internet is down", () => {
    expect(catalogEmptyState({ ...base, offlineProblem: "internet" })).toEqual({
      titleKey: "shell.offline.internet",
      hintKey: "app.internetUnavailable",
      action: "retryConnection",
    });
  });

  it("offers a reload after a failed request", () => {
    expect(catalogEmptyState({ ...base, hasError: true }).action).toBe(
      "retryLoad",
    );
  });

  it("offers a filter reset when filters emptied the list", () => {
    const filters = { ...EMPTY_FILTERS, loader: "fabric", mc: "26.2" };
    expect(catalogEmptyState({ ...base, filters })).toEqual({
      titleKey: "common.notFound",
      hintKey: "community.notFoundFiltersHint",
      action: "resetFilters",
    });
  });

  it("mentions the search only when there is one", () => {
    const filters = { ...EMPTY_FILTERS, query: "tanks" };
    expect(catalogEmptyState({ ...base, filters }).hintKey).toBe(
      "community.notFoundHint",
    );
  });

  it("onboards when the catalog itself is empty", () => {
    expect(catalogEmptyState(base)).toEqual({
      titleKey: "community.emptyTitle",
      hintKey: "community.emptyHint",
      action: "none",
    });
  });
});

describe("facets", () => {
  const facets: IExploreFacets = {
    loaders: [
      { name: "vanilla", count: 4 },
      { name: "fabric", count: 1 },
      { name: "neoforge", count: 2 },
    ],
    minecraftVersions: [
      { version: "26.2", count: 1 },
      { version: "1.21.1", count: 2 },
    ],
  };

  it("orders loaders by count", () => {
    expect(loaderFacetOptions(facets).map((entry) => entry.value)).toEqual([
      "vanilla",
      "neoforge",
      "fabric",
    ]);
  });

  it("keeps the server order of versions", () => {
    expect(versionFacetOptions(facets).map((entry) => entry.value)).toEqual([
      "26.2",
      "1.21.1",
    ]);
  });

  it("survives a missing or broken payload", () => {
    expect(normalizeFacets(null)).toEqual({
      loaders: [],
      minecraftVersions: [],
    });
    expect(
      normalizeFacets({
        loaders: [{ name: "", count: 3 }],
        minecraftVersions: [],
      }).loaders,
    ).toEqual([]);
  });
});

describe("isFilterActive", () => {
  it("is false for untouched filters and true once one is set", () => {
    expect(isFilterActive(EMPTY_FILTERS)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTERS, sort: "new" })).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTERS, loader: "fabric" })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, query: " a " })).toBe(true);
  });
});

describe("packContentParts", () => {
  it("keeps only non-empty counters in a fixed order", () => {
    expect(packContentParts({ mods: 94, servers: 11, otherFiles: 0 })).toEqual([
      { key: "mods", value: 94 },
      { key: "servers", value: 11 },
    ]);
  });

  it("ignores the service files the server counts for every pack", () => {
    expect(packContentParts({ mods: 0, servers: 0, otherFiles: 1 })).toEqual(
      [],
    );
  });

  it("returns nothing for an empty summary", () => {
    expect(packContentParts(undefined)).toEqual([]);
    expect(packContentParts({ mods: 0, servers: 0, otherFiles: 0 })).toEqual(
      [],
    );
  });
});
