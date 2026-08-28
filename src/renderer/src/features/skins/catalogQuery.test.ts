import { describe, expect, it } from "vitest";
import { ICatalogSkin } from "@/types/SkinManager";
import {
  availableCatalogSources,
  availableCatalogTypes,
  catalogColumns,
  catalogColumnWidth,
  catalogPreviewHeight,
  catalogTileHeight,
  catalogDisplayName,
  catalogHasMore,
  catalogPreviewSkinUrl,
  catalogSourceHref,
  catalogSourceLabel,
  hasCatalogFilters,
  INITIAL_CATALOG_STATE,
  isCatalogItemImportable,
  isOwnCatalog,
  mergeCatalogPage,
  normalizeCatalogState,
  toCatalogParams,
} from "./catalogQuery";

function item(partial: Partial<ICatalogSkin> & { id: string }): ICatalogSkin {
  return {
    type: "skin",
    name: partial.id,
    model: "classic",
    tags: [],
    source: "community",
    authorName: null,
    skinUrl: `https://cdn/${partial.id}.png`,
    ...partial,
  };
}

describe("catalog sources and types", () => {
  it("adds the personal source only when signed in", () => {
    expect(availableCatalogSources(false)).toEqual([
      "all",
      "official",
      "community",
    ]);
    expect(availableCatalogSources(true)).toContain("mine");
  });

  it("hides packs in the official source", () => {
    expect(availableCatalogTypes("official")).toEqual(["skin", "cape"]);
    expect(availableCatalogTypes("community")).toEqual(["skin", "cape", "pack"]);
  });

  it("drops an impossible type when the source changes", () => {
    const state = normalizeCatalogState({
      ...INITIAL_CATALOG_STATE,
      source: "official",
      type: "pack",
    });

    expect(state.type).toBe("skin");
  });

  it("keeps a possible type", () => {
    const state = normalizeCatalogState({
      ...INITIAL_CATALOG_STATE,
      source: "community",
      type: "pack",
    });

    expect(state.type).toBe("pack");
  });
});

describe("toCatalogParams", () => {
  it("omits empty values and the aggregate source", () => {
    expect(toCatalogParams(INITIAL_CATALOG_STATE, 1, 60)).toEqual({
      search: undefined,
      tag: undefined,
      source: undefined,
      type: "skin",
      sort: "new",
      page: 1,
      limit: 60,
    });
  });

  it("passes trimmed search, tag and source", () => {
    const params = toCatalogParams(
      {
        source: "community",
        type: "cape",
        sort: "downloads",
        search: "  dragon ",
        tag: "anime",
      },
      3,
      20,
    );

    expect(params).toEqual({
      search: "dragon",
      tag: "anime",
      source: "community",
      type: "cape",
      sort: "downloads",
      page: 3,
      limit: 20,
    });
  });
});

describe("filters state", () => {
  it("knows when search or tag is active", () => {
    expect(hasCatalogFilters(INITIAL_CATALOG_STATE)).toBe(false);
    expect(hasCatalogFilters({ ...INITIAL_CATALOG_STATE, search: "  " })).toBe(
      false,
    );
    expect(hasCatalogFilters({ ...INITIAL_CATALOG_STATE, search: "a" })).toBe(
      true,
    );
    expect(hasCatalogFilters({ ...INITIAL_CATALOG_STATE, tag: "x" })).toBe(true);
  });

  it("knows the personal source", () => {
    expect(isOwnCatalog(INITIAL_CATALOG_STATE)).toBe(false);
    expect(isOwnCatalog({ ...INITIAL_CATALOG_STATE, source: "mine" })).toBe(
      true,
    );
  });
});

describe("mergeCatalogPage", () => {
  it("replaces the list on the first page", () => {
    expect(
      mergeCatalogPage([item({ id: "a" })], [item({ id: "b" })], 1).map(
        (entry) => entry.id,
      ),
    ).toEqual(["b"]);
  });

  it("appends without duplicates", () => {
    const merged = mergeCatalogPage(
      [item({ id: "a" }), item({ id: "b" })],
      [item({ id: "b" }), item({ id: "c" })],
      2,
    );

    expect(merged.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("catalogHasMore", () => {
  it("is false for the personal source", () => {
    expect(
      catalogHasMore({ ...INITIAL_CATALOG_STATE, source: "mine" }, 3, 90),
    ).toBe(false);
  });

  it("compares loaded against total", () => {
    expect(catalogHasMore(INITIAL_CATALOG_STATE, 60, 120)).toBe(true);
    expect(catalogHasMore(INITIAL_CATALOG_STATE, 120, 120)).toBe(false);
    expect(catalogHasMore(INITIAL_CATALOG_STATE, 0, 0)).toBe(false);
  });
});

describe("catalogPreviewSkinUrl", () => {
  it("wears a cape on the player's own skin", () => {
    expect(
      catalogPreviewSkinUrl(
        item({ id: "c", type: "cape", capeUrl: "https://cdn/c-cape.png" }),
        "file:///mine.png",
      ),
    ).toBe("file:///mine.png");
  });

  it("has nothing to show without a player skin", () => {
    expect(catalogPreviewSkinUrl(null)).toBeUndefined();
    expect(
      catalogPreviewSkinUrl(item({ id: "c", type: "cape", skinUrl: null })),
    ).toBeUndefined();
    expect(catalogPreviewSkinUrl(item({ id: "s", skinUrl: null }))).toBeUndefined();
  });

  it("uses the catalog skin itself", () => {
    expect(catalogPreviewSkinUrl(item({ id: "s" }), "file:///mine.png")).toBe(
      "https://cdn/s.png",
    );
  });
});

describe("catalogDisplayName", () => {
  it("strips the imported suffix", () => {
    expect(catalogDisplayName("ngga3 Minecraft Skin")).toBe("ngga3");
    expect(catalogDisplayName("Frog  minecraft skins")).toBe("Frog");
  });

  it("keeps names that are only the suffix", () => {
    expect(catalogDisplayName("Minecraft Skin")).toBe("Minecraft Skin");
  });

  it("leaves other names alone", () => {
    expect(catalogDisplayName("  Cute cat  ")).toBe("Cute cat");
    expect(catalogDisplayName("Minecraft Skin Editor")).toBe(
      "Minecraft Skin Editor",
    );
  });
});

describe("isCatalogItemImportable", () => {
  it("requires the matching urls", () => {
    expect(isCatalogItemImportable(null)).toBe(false);
    expect(isCatalogItemImportable(item({ id: "s" }))).toBe(true);
    expect(isCatalogItemImportable(item({ id: "s", skinUrl: null }))).toBe(false);
    expect(
      isCatalogItemImportable(item({ id: "c", type: "cape", capeUrl: null })),
    ).toBe(false);
    expect(
      isCatalogItemImportable(
        item({ id: "c", type: "cape", capeUrl: "https://cdn/c.png" }),
      ),
    ).toBe(true);
    expect(
      isCatalogItemImportable(item({ id: "p", type: "pack", capeUrl: null })),
    ).toBe(false);
    expect(
      isCatalogItemImportable(
        item({ id: "p", type: "pack", capeUrl: "https://cdn/p-cape.png" }),
      ),
    ).toBe(true);
  });
});

describe("catalogColumns", () => {
  it("fits as many tiles as the measured width allows", () => {
    expect(catalogColumns(624)).toBe(6);
    expect(catalogColumns(400)).toBe(3);
    expect(catalogColumns(208)).toBe(2);
  });

  it("stays within sane bounds before the first measurement", () => {
    expect(catalogColumns(0)).toBe(4);
    expect(catalogColumns(-40)).toBe(4);
    expect(catalogColumns(60)).toBe(2);
    expect(catalogColumns(4000)).toBe(8);
  });
});

describe("tile geometry", () => {
  it("splits the measured width between the columns and the gaps", () => {
    expect(catalogColumnWidth(624, 6)).toBeCloseTo(97.33, 1);
    expect(catalogColumnWidth(208, 2)).toBe(100);
    expect(catalogColumnWidth(0, 4)).toBe(0);
    expect(catalogColumnWidth(400, 0)).toBe(0);
  });

  it("grows the tile with the column so a full-body preview fits", () => {
    const columns = catalogColumns(624);
    const width = catalogColumnWidth(624, columns);

    expect(catalogPreviewHeight(width)).toBe(85);
    expect(catalogTileHeight(width)).toBe(117);
    expect(catalogTileHeight(catalogColumnWidth(1000, 8))).toBeGreaterThan(
      catalogTileHeight(width),
    );
  });

  it("never collapses below a readable preview", () => {
    expect(catalogPreviewHeight(0)).toBe(64);
    expect(catalogTileHeight(0)).toBe(96);
    expect(catalogPreviewHeight(Number.NaN)).toBe(64);
  });
});

describe("attribution", () => {
  it("names the import source the way the site spells it", () => {
    expect(catalogSourceLabel("namemc")).toBe("NameMC");
    expect(catalogSourceLabel("NameMC")).toBe("NameMC");
    expect(catalogSourceLabel("someplace")).toBe("someplace");
  });

  it("has nothing to show without a source", () => {
    expect(catalogSourceLabel(null)).toBe("");
    expect(catalogSourceLabel("   ")).toBe("");
  });

  it("only opens http links outside", () => {
    expect(catalogSourceHref("https://namemc.com/skin/5e5664c1002a1fac")).toBe(
      "https://namemc.com/skin/5e5664c1002a1fac",
    );
    expect(catalogSourceHref("javascript:alert(1)")).toBeNull();
    expect(catalogSourceHref("/skin/1")).toBeNull();
    expect(catalogSourceHref(null)).toBeNull();
  });
});
