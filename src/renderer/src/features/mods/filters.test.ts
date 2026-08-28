import { describe, expect, it } from "vitest";

import { ContentEntry } from "./entries";
import {
  buildCatalogChips,
  catalogFilterKey,
  catalogFilterLabel,
  categoryLocaleKey,
  countLibraryFacets,
  humanizeFilterName,
  filterLibraryEntries,
  matchesTextQuery,
  sortLibraryEntries,
  toggleValue,
} from "./filters";
import { ProjectType, Provider } from "@/types/ModManager";

function entry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return {
    key: `${overrides.provider ?? Provider.MODRINTH}:${overrides.id ?? "id"}`,
    id: "id",
    provider: Provider.MODRINTH,
    projectType: ProjectType.MOD,
    title: "Sodium",
    description: "Rendering engine",
    iconUrl: null,
    url: "",
    installed: null,
    project: null,
    pendingRemoved: false,
    side: "both",
    size: 0,
    fileName: "sodium.jar",
    markedDisabled: false,
    ...overrides,
  };
}

describe("matchesTextQuery", () => {
  it("matches title, description and file name", () => {
    const item = entry();
    expect(matchesTextQuery(item, "sod")).toBe(true);
    expect(matchesTextQuery(item, "RENDERING")).toBe(true);
    expect(matchesTextQuery(item, "sodium.jar")).toBe(true);
    expect(matchesTextQuery(item, "iris")).toBe(false);
  });

  it("treats an empty query as a match", () => {
    expect(matchesTextQuery(entry(), "   ")).toBe(true);
  });
});

describe("countLibraryFacets", () => {
  it("counts every facet independently", () => {
    const entries = [
      entry({ key: "a", id: "a", side: "client" }),
      entry({
        key: "b",
        id: "b",
        provider: Provider.CURSEFORGE,
        side: "server",
      }),
      entry({ key: "c", id: "c", provider: Provider.LOCAL }),
      entry({ key: "d", id: "d", markedDisabled: true }),
    ];

    const counts = countLibraryFacets(entries, new Set(["a"]), new Set(["b"]));

    expect(counts.update).toBe(1);
    expect(counts.disabled).toBe(2);
    expect(counts.client).toBe(1);
    expect(counts.server).toBe(1);
    expect(counts.curseforge).toBe(1);
    expect(counts.modrinth).toBe(2);
    expect(counts.local).toBe(1);
  });
});

describe("filterLibraryEntries", () => {
  const entries = [
    entry({ key: "a", id: "a", title: "Sodium", side: "client" }),
    entry({ key: "b", id: "b", title: "Iris", provider: Provider.CURSEFORGE }),
    entry({ key: "c", id: "c", title: "Lithium", markedDisabled: true }),
  ];

  it("combines facets with AND", () => {
    const result = filterLibraryEntries(
      entries,
      { query: "", facets: ["update", "client"], sort: "name" },
      new Set(["a", "b"]),
      new Set(),
    );

    expect(result.map((item) => item.key)).toEqual(["a"]);
  });

  it("applies the text query together with facets", () => {
    const result = filterLibraryEntries(
      entries,
      { query: "li", facets: ["disabled"], sort: "name" },
      new Set(),
      new Set(),
    );

    expect(result.map((item) => item.key)).toEqual(["c"]);
  });

  it("returns everything without filters", () => {
    const result = filterLibraryEntries(
      entries,
      { query: "", facets: [], sort: "name" },
      new Set(),
      new Set(),
    );

    expect(result).toHaveLength(3);
  });
});

describe("sortLibraryEntries", () => {
  const entries = [
    entry({ key: "b", id: "b", title: "beta", size: 10 }),
    entry({ key: "a", id: "a", title: "Alpha", size: 30 }),
    entry({ key: "c", id: "c", title: "Gamma", size: 20 }),
  ];

  it("sorts by name case-insensitively", () => {
    expect(
      sortLibraryEntries(entries, "name", new Set()).map((item) => item.title),
    ).toEqual(["Alpha", "beta", "Gamma"]);
  });

  it("sorts by name descending", () => {
    expect(
      sortLibraryEntries(entries, "nameDesc", new Set()).map(
        (item) => item.title,
      ),
    ).toEqual(["Gamma", "beta", "Alpha"]);
  });

  it("sorts by size descending", () => {
    expect(
      sortLibraryEntries(entries, "size", new Set()).map((item) => item.title),
    ).toEqual(["Alpha", "Gamma", "beta"]);
  });

  it("puts updatable entries first", () => {
    expect(
      sortLibraryEntries(entries, "update", new Set(["c"])).map(
        (item) => item.title,
      ),
    ).toEqual(["Gamma", "Alpha", "beta"]);
  });

  it("does not mutate the input", () => {
    const source = [...entries];
    sortLibraryEntries(source, "name", new Set());
    expect(source.map((item) => item.key)).toEqual(["b", "a", "c"]);
  });
});

describe("catalog filter helpers", () => {
  it("keys CurseForge by id and Modrinth by name", () => {
    expect(
      catalogFilterKey({ name: "Magic", id: "42" }, Provider.CURSEFORGE),
    ).toBe("42");
    expect(catalogFilterKey({ name: "magic" }, Provider.MODRINTH)).toBe(
      "magic",
    );
  });

  it("capitalizes Modrinth labels only", () => {
    expect(catalogFilterLabel({ name: "magic" }, Provider.MODRINTH)).toBe(
      "Magic",
    );
    expect(catalogFilterLabel({ name: "magic" }, Provider.CURSEFORGE)).toBe(
      "magic",
    );
  });

  it("builds chips and falls back to the raw key", () => {
    const chips = buildCatalogChips(
      [{ title: "Categories", items: [{ name: "magic", icon: "icon" }] }],
      ["magic", "ghost"],
      Provider.MODRINTH,
    );

    expect(chips).toEqual([
      { key: "magic", label: "Magic", icon: "icon" },
      { key: "ghost", label: "ghost" },
    ]);
  });
});

describe("toggleValue", () => {
  it("adds and removes", () => {
    expect(toggleValue([], "a")).toEqual(["a"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("category labels", () => {
  const ru: Record<string, string> = {
    "modManager.categories.game_mechanics": "Механики игры",
    "modManager.categories.worldgen": "Генерация мира",
  };
  const translate = (key: string, fallback: string) => ru[key] ?? fallback;

  it("builds a locale key from an api slug", () => {
    expect(categoryLocaleKey("game-mechanics")).toBe(
      "modManager.categories.game_mechanics",
    );
    expect(categoryLocaleKey("Core Shaders")).toBe(
      "modManager.categories.core_shaders",
    );
  });

  it("translates known categories", () => {
    expect(
      catalogFilterLabel(
        { name: "game-mechanics" },
        Provider.MODRINTH,
        translate,
      ),
    ).toBe("Механики игры");
  });

  it("never shows a raw slug for an unknown category", () => {
    expect(
      catalogFilterLabel({ name: "time_travel" }, Provider.MODRINTH, translate),
    ).toBe("Time travel");
    expect(humanizeFilterName("game-mechanics")).toBe("Game mechanics");
  });

  it("keeps curseforge names as the source sends them", () => {
    expect(
      catalogFilterLabel(
        { name: "Adventure and RPG" },
        Provider.CURSEFORGE,
        translate,
      ),
    ).toBe("Adventure and RPG");
  });
});
