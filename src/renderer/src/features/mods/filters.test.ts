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
  findDuplicates,
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
  it("survives mods saved without a title or description", () => {
    const broken = entry({
      title: undefined as unknown as string,
      description: undefined as unknown as string,
    });

    expect(() => matchesTextQuery(broken, "sod")).not.toThrow();
    expect(matchesTextQuery(broken, "sodium.jar")).toBe(true);
  });

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

    const counts = countLibraryFacets(entries, {
      updatable: new Set(["a"]),
      disabled: new Set(["b"]),
    });

    expect(counts.update).toBe(1);
    expect(counts.disabled).toBe(2);
    expect(counts.client).toBe(1);
    expect(counts.server).toBe(1);
    expect(counts.curseforge).toBe(1);
    expect(counts.modrinth).toBe(2);
    expect(counts.local).toBe(1);
  });
});

describe("findDuplicates", () => {
  it("flags a local copy of a mod that is also installed from a catalog", () => {
    const entries = [
      entry({
        key: "curseforge:1",
        provider: Provider.CURSEFORGE,
        title: "Sodium",
        fileName: "sodium-2.jar",
      }),
      entry({
        key: "local:sodium",
        provider: Provider.LOCAL,
        title: "Sodium (Fabric)",
        fileName: "sodium-1.jar",
      }),
      entry({
        key: "local:iris",
        provider: Provider.LOCAL,
        title: "Iris",
        fileName: "iris.jar",
      }),
    ];

    const marks = findDuplicates(entries);
    expect([...marks.extra]).toEqual(["local:sodium"]);
    expect([...marks.all]).toEqual(["local:sodium"]);
    expect(marks.groups).toBe(1);
  });

  it("ignores mods already waiting to be removed", () => {
    const entries = [
      entry({
        key: "modrinth:x",
        provider: Provider.MODRINTH,
        title: "Sodium",
      }),
      entry({
        key: "local:sodium",
        provider: Provider.LOCAL,
        title: "Sodium",
        pendingRemoved: true,
      }),
    ];

    expect(findDuplicates(entries).all.size).toBe(0);
  });

  it("keeps one record of a file that two catalogs both claim", () => {
    const entries = [
      entry({
        key: "modrinth:arch",
        provider: Provider.MODRINTH,
        title: "Architectury API",
        fileName: "architectury-13.0.11-neoforge.jar",
      }),
      entry({
        key: "curseforge:419699",
        provider: Provider.CURSEFORGE,
        title: "Architectury API",
        fileName: "architectury-13.0.11-neoforge.jar",
      }),
    ];

    const marks = findDuplicates(entries);
    expect([...marks.extra]).toEqual(["curseforge:419699"]);
    expect(marks.groups).toBe(1);
  });

  it("drops the local record that shares a file with a catalog copy, whatever its title", () => {
    const entries = [
      entry({
        key: "local:terrablender",
        provider: Provider.LOCAL,
        title: "TerraBlender",
        fileName: "TerraBlender-neoforge-1.21.1-4.1.0.8.jar",
      }),
      entry({
        key: "curseforge:563928",
        provider: Provider.CURSEFORGE,
        title: "TerraBlender (NeoForge)",
        fileName: "TerraBlender-neoforge-1.21.1-4.1.0.8.jar",
      }),
    ];

    expect([...findDuplicates(entries).extra]).toEqual(["local:terrablender"]);
  });

  it("keeps the copy whose provider still has a file for this version", () => {
    const entries = [
      entry({
        key: "modrinth:iron",
        provider: Provider.MODRINTH,
        title: "Iron Chests",
        fileName: "ironchest.jar",
      }),
      entry({
        key: "curseforge:228756",
        provider: Provider.CURSEFORGE,
        title: "Iron Chests",
        fileName: "ironchest.jar",
      }),
    ];

    const marks = findDuplicates(entries, new Set(["modrinth:iron"]));
    expect([...marks.extra]).toEqual(["modrinth:iron"]);
  });

  it("asks for a choice when two catalogs installed different files of one mod", () => {
    const entries = [
      entry({
        key: "modrinth:aga",
        provider: Provider.MODRINTH,
        title: "AE2 Growth Accelerators",
        fileName: "ae2-growth-accelerator-tiers-1.0.1.jar",
      }),
      entry({
        key: "curseforge:1",
        provider: Provider.CURSEFORGE,
        title: "AE2 Growth Accelerators",
        fileName: "AGA Neo1.21.1 2.2.0.jar",
      }),
    ];

    const marks = findDuplicates(entries);
    expect(marks.extra.size).toBe(0);
    expect([...marks.all].sort()).toEqual(["curseforge:1", "modrinth:aga"]);
    expect(marks.groups).toBe(1);
  });

  it("does not flag two projects of one catalog that happen to share a title", () => {
    const entries = [
      entry({
        key: "curseforge:1",
        provider: Provider.CURSEFORGE,
        title: "Backpacks",
        fileName: "a.jar",
      }),
      entry({
        key: "curseforge:2",
        provider: Provider.CURSEFORGE,
        title: "Backpacks",
        fileName: "b.jar",
      }),
    ];

    expect(findDuplicates(entries).all.size).toBe(0);
  });

  it("matches a disabled file to its enabled twin", () => {
    const entries = [
      entry({
        key: "modrinth:a",
        provider: Provider.MODRINTH,
        title: "A",
        fileName: "a.jar",
      }),
      entry({
        key: "curseforge:1",
        provider: Provider.CURSEFORGE,
        title: "B",
        fileName: "A.jar.disabled",
      }),
    ];

    expect(findDuplicates(entries).extra.size).toBe(1);
  });

  it("counts duplicates as a facet", () => {
    const entries = [
      entry({
        key: "modrinth:x",
        provider: Provider.MODRINTH,
        title: "Sodium",
        fileName: "sodium-2.jar",
      }),
      entry({
        key: "local:sodium",
        provider: Provider.LOCAL,
        title: "Sodium",
        fileName: "sodium-1.jar",
      }),
    ];

    const counts = countLibraryFacets(entries, {
      updatable: new Set(),
      disabled: new Set(),
      duplicates: findDuplicates(entries).all,
    });

    expect(counts.duplicate).toBe(1);
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
      { updatable: new Set(["a", "b"]), disabled: new Set() },
    );

    expect(result.map((item) => item.key)).toEqual(["a"]);
  });

  it("applies the text query together with facets", () => {
    const result = filterLibraryEntries(
      entries,
      { query: "li", facets: ["disabled"], sort: "name" },
      { updatable: new Set(), disabled: new Set() },
    );

    expect(result.map((item) => item.key)).toEqual(["c"]);
  });

  it("returns everything without filters", () => {
    const result = filterLibraryEntries(
      entries,
      { query: "", facets: [], sort: "name" },
      { updatable: new Set(), disabled: new Set() },
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

  it("sorts by the name without loader tags or leading version brackets", () => {
    const tagged = [
      entry({ key: "s", id: "s", title: "[1.21.1] SecurityCraft" }),
      entry({ key: "t", id: "t", title: "TerraBlender (NeoForge)" }),
      entry({ key: "a", id: "a", title: "Architectury API" }),
    ];

    expect(
      sortLibraryEntries(tagged, "name", new Set()).map((item) => item.key),
    ).toEqual(["a", "s", "t"]);
  });

  it("filters mods installed for another loader", () => {
    const list = [
      entry({ key: "fabric", id: "fabric", title: "Fabric mod" }),
      entry({ key: "native", id: "native", title: "Native mod" }),
    ];
    const marks = {
      updatable: new Set<string>(),
      disabled: new Set<string>(),
      foreign: new Set(["fabric"]),
    };

    expect(
      filterLibraryEntries(
        list,
        { query: "", facets: ["foreign"], sort: "name" },
        marks,
      ).map((item) => item.key),
    ).toEqual(["fabric"]);
    expect(countLibraryFacets(list, marks).foreign).toBe(1);
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

  it("puts recently changed entries first and unknown ones by name", () => {
    const changedAt = new Map([
      ["c", 2_000],
      ["b", 5_000],
    ]);

    expect(
      sortLibraryEntries(entries, "recent", new Set(), changedAt).map(
        (item) => item.title,
      ),
    ).toEqual(["beta", "Gamma", "Alpha"]);
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
