import { describe, expect, it } from "vitest";
import { InstanceLike } from "./selectors";
import {
  EMPTY_LIBRARY_FILTERS,
  LibraryFilters,
  availableFacets,
  buildLibraryEntries,
  countFilters,
  filterLibrary,
  listFilters,
  matchesQuery,
  mergeManualOrder,
  moveFocus,
  selectLibrary,
  sortLibrary,
  toggleFilter,
} from "./library";

function make(
  name: string,
  options: {
    loader?: string;
    id?: string;
    path?: string;
    lastLaunch?: string;
    lastUpdate?: string;
  } = {},
): InstanceLike {
  return {
    versionPath: options.path,
    version: {
      name,
      loader: { name: options.loader ?? "forge" },
      version: { id: options.id ?? "1.21.1" },
      lastLaunch: options.lastLaunch,
      lastUpdate: options.lastUpdate,
    },
  };
}

const filtersWith = (patch: Partial<LibraryFilters>): LibraryFilters => ({
  ...EMPTY_LIBRARY_FILTERS,
  ...patch,
});

describe("filters", () => {
  it("toggles values on and off without touching other facets", () => {
    const one = toggleFilter(EMPTY_LIBRARY_FILTERS, "loader", "fabric");
    const two = toggleFilter(one, "tag", "pvp");

    expect(two.loader).toEqual(["fabric"]);
    expect(two.tag).toEqual(["pvp"]);
    expect(toggleFilter(two, "loader", "fabric").loader).toEqual([]);
    expect(countFilters(two)).toBe(2);
  });

  it("lists every active filter with its facet", () => {
    const filters = filtersWith({ loader: ["fabric"], state: ["behind"] });

    expect(listFilters(filters)).toEqual([
      { facet: "loader", value: "fabric" },
      { facet: "state", value: "behind" },
    ]);
  });
});

describe("availableFacets", () => {
  it("drops the loader facet when every instance shares one loader", () => {
    const facets = availableFacets({ loaders: ["fabric"], tags: ["pvp"] });

    expect(facets.loader).toEqual([]);
    expect(facets.tag).toEqual(["pvp"]);
  });

  it("offers the loader facet once loaders differ", () => {
    const facets = availableFacets({ loaders: ["fabric", "forge"] });

    expect(facets.loader).toEqual(["fabric", "forge"]);
  });

  it("offers the update facet only when something is behind", () => {
    expect(availableFacets({ hasUpdates: true }).state).toEqual(["behind"]);
    expect(availableFacets({ hasUpdates: false }).state).toEqual([]);
  });

  it("reports zero facets for a single untagged instance", () => {
    const facets = availableFacets({
      loaders: ["vanilla"],
      tags: [],
      hasUpdates: false,
    });

    expect(countFilters(facets)).toBe(0);
  });

  it("counts every facet the menu can offer", () => {
    const facets = availableFacets({
      loaders: ["fabric", "forge"],
      tags: ["pvp", "coop"],
      hasUpdates: true,
    });

    expect(countFilters(facets)).toBe(5);
  });
});

describe("matchesQuery", () => {
  const instance = make("Cobblemon Fun", { loader: "fabric", id: "1.21.1" });

  it("matches the name, the loader, the version and the tags", () => {
    expect(matchesQuery(instance, [], "cobble")).toBe(true);
    expect(matchesQuery(instance, [], "fabric")).toBe(true);
    expect(matchesQuery(instance, [], "1.21")).toBe(true);
    expect(matchesQuery(instance, ["pvp"], "pvp")).toBe(true);
    expect(matchesQuery(instance, [], "forge")).toBe(false);
  });

  it("requires every whitespace separated token", () => {
    expect(matchesQuery(instance, [], "cobble fabric")).toBe(true);
    expect(matchesQuery(instance, [], "cobble forge")).toBe(false);
    expect(matchesQuery(instance, [], "   ")).toBe(true);
  });
});

describe("filterLibrary", () => {
  const fabric = make("Fabric 26.2", { loader: "fabric", path: "/f" });
  const forge = make("Forge 26.2", { loader: "forge", path: "/g" });
  const neo = make("Neo pack", { loader: "neoforge", path: "/n" });
  const all = [fabric, forge, neo];

  it("keeps everything without filters", () => {
    expect(filterLibrary(all)).toHaveLength(3);
  });

  it("treats several loaders as OR", () => {
    expect(
      filterLibrary(all, {
        filters: filtersWith({ loader: ["fabric", "neoforge"] }),
      }),
    ).toEqual([fabric, neo]);
  });

  it("treats different facets as AND", () => {
    expect(
      filterLibrary(all, {
        filters: filtersWith({ loader: ["fabric"], tag: ["pvp"] }),
        tags: { "/g": ["pvp"] },
      }),
    ).toEqual([]);

    expect(
      filterLibrary(all, {
        filters: filtersWith({ loader: ["fabric"], tag: ["pvp"] }),
        tags: { "/f": ["pvp"] },
      }),
    ).toEqual([fabric]);
  });

  it("matches a tag whatever case it was typed in", () => {
    expect(
      filterLibrary(all, {
        filters: filtersWith({ tag: ["Покемоны"] }),
        tags: { "/f": ["покемоны"], "/g": ["Покемоны"] },
      }),
    ).toEqual([fabric, forge]);
  });

  it("filters by update state", () => {
    expect(
      filterLibrary(all, {
        filters: filtersWith({ state: ["behind"] }),
        updates: { "/g": "behind", "/f": "sync" },
      }),
    ).toEqual([forge]);
  });
});

describe("sortLibrary", () => {
  const old = make("Old", { path: "/old", lastLaunch: "2026-01-01T00:00:00Z" });
  const fresh = make("Fresh", {
    path: "/fresh",
    lastLaunch: "2026-08-01T00:00:00Z",
  });
  const never = make("Never", { path: "/never" });

  it("sorts by activity by default", () => {
    expect(sortLibrary([old, never, fresh])).toEqual([fresh, old, never]);
  });

  it("counts a launch recorded in statistics as activity", () => {
    expect(
      sortLibrary([old, never, fresh], {
        lastLaunch: { "/never": Date.parse("2026-08-20T00:00:00Z") },
      }),
    ).toEqual([never, fresh, old]);
  });

  it("pins running instances to the top of every automatic sort", () => {
    expect(
      sortLibrary([fresh, old, never], { runningKeys: ["/never"] })[0],
    ).toBe(never);
    expect(
      sortLibrary([fresh, old, never], {
        sort: "name",
        runningKeys: ["/old"],
      })[0],
    ).toBe(old);
  });

  it("sorts by playtime and falls back to the name", () => {
    expect(
      sortLibrary([old, fresh, never], {
        sort: "playtime",
        playtime: { "/old": 100, "/fresh": 100 },
      }),
    ).toEqual([fresh, old, never]);
  });

  it("sorts by name naturally", () => {
    const a = make("Pack 2");
    const b = make("Pack 10");
    expect(sortLibrary([b, a], { sort: "name" })).toEqual([a, b]);
  });

  it("keeps the manual order and appends unknown keys", () => {
    expect(
      sortLibrary([old, fresh, never], {
        sort: "manual",
        manualOrder: ["/never", "/fresh"],
      }),
    ).toEqual([never, fresh, old]);
  });

  it("ignores manual positions of instances that no longer exist", () => {
    const rebuilt = sortLibrary([old, fresh, never], {
      sort: "manual",
      manualOrder: ["/gone-1", "/never", "/gone-2", "/fresh"],
    }).map((instance) => instance.versionPath);

    expect(rebuilt).toEqual(["/never", "/fresh", "/old"]);
  });

  it("does not mutate the input", () => {
    const input = [old, fresh];
    selectLibrary(input, { sort: "name" });
    expect(input).toEqual([old, fresh]);
  });
});

describe("buildLibraryEntries", () => {
  const a = make("A", { path: "/a" });
  const b = make("B", { path: "/b" });
  const c = make("C", { path: "/c" });

  it("returns flat items when there are no groups", () => {
    expect(buildLibraryEntries([a, b], [], { ungroupedName: "Rest" })).toEqual([
      { kind: "item", key: "/a", instance: a },
      { kind: "item", key: "/b", instance: b },
    ]);
  });

  it("puts members under their group and the rest under the tail header", () => {
    const entries = buildLibraryEntries(
      [a, b, c],
      [{ id: "g1", name: "Co-op", keys: ["/b"] }],
      { ungroupedName: "Rest" },
    );

    expect(entries.map((entry) => entry.key)).toEqual([
      "group:g1",
      "/b",
      "group:none",
      "/a",
      "/c",
    ]);
  });

  it("hides members of a collapsed group but keeps the count", () => {
    const entries = buildLibraryEntries(
      [a, b],
      [{ id: "g1", name: "Co-op", keys: ["/a", "/b"], collapsed: true }],
      { ungroupedName: "Rest" },
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: "header", count: 2 });
    expect(entries[1]).toMatchObject({ kind: "header", id: null, count: 0 });
  });

  it("shows matches that sit inside a collapsed group while filtering", () => {
    const entries = buildLibraryEntries(
      [a],
      [{ id: "g1", name: "Co-op", keys: ["/a", "/b"], collapsed: true }],
      { ungroupedName: "Rest", hideEmptyGroups: true, expandGroups: true },
    );

    expect(entries.map((entry) => entry.key)).toEqual(["group:g1", "/a"]);
    expect(entries[0]).toMatchObject({ kind: "header", collapsed: false });
  });

  it("shows the ungrouped tail while filtering even when it is collapsed", () => {
    const entries = buildLibraryEntries(
      [a],
      [{ id: "g1", name: "Co-op", keys: ["/b"] }],
      {
        ungroupedName: "Rest",
        ungroupedCollapsed: true,
        hideEmptyGroups: true,
        expandGroups: true,
      },
    );

    expect(entries.map((entry) => entry.key)).toEqual(["group:none", "/a"]);
  });

  it("drops headers of groups a filter emptied", () => {
    const entries = buildLibraryEntries(
      [a],
      [
        { id: "g1", name: "Co-op", keys: ["/a"] },
        { id: "g2", name: "Solo", keys: ["/b"] },
      ],
      { ungroupedName: "Rest", hideEmptyGroups: true },
    );

    expect(entries.map((entry) => entry.key)).toEqual(["group:g1", "/a"]);
  });

  it("keeps empty headers as drop targets when nothing is filtered", () => {
    const entries = buildLibraryEntries(
      [a],
      [{ id: "g2", name: "Solo", keys: [] }],
      { ungroupedName: "Rest" },
    );

    expect(entries.map((entry) => entry.key)).toEqual([
      "group:g2",
      "group:none",
      "/a",
    ]);
  });

  it("hides the ungrouped tail when it is collapsed", () => {
    const entries = buildLibraryEntries(
      [a, b],
      [{ id: "g1", name: "Co-op", keys: ["/a"] }],
      { ungroupedName: "Rest", ungroupedCollapsed: true },
    );

    expect(entries.map((entry) => entry.key)).toEqual([
      "group:g1",
      "/a",
      "group:none",
    ]);
  });
});

describe("mergeManualOrder", () => {
  it("writes the new order back into the slots the visible rows occupied", () => {
    expect(
      mergeManualOrder(["a", "hidden", "b", "c"], ["a", "b", "c"], ["c", "a", "b"]),
    ).toEqual(["c", "hidden", "a", "b"]);
  });

  it("keeps instances that no filter shows", () => {
    const result = mergeManualOrder(
      ["a", "b", "c"],
      ["a", "c"],
      ["c", "a"],
    );

    expect(result).toEqual(["c", "b", "a"]);
    expect(result).toHaveLength(3);
  });

  it("appends visible keys the stored order never had", () => {
    expect(mergeManualOrder([], ["a", "b"], ["b", "a"])).toEqual(["b", "a"]);
    expect(mergeManualOrder(["a"], ["a", "b"], ["b", "a"])).toEqual(["b", "a"]);
  });
});

describe("moveFocus", () => {
  it("starts at the edge when nothing is focused", () => {
    expect(moveFocus(["a", "b"], null, 1)).toBe("a");
    expect(moveFocus(["a", "b"], null, -1)).toBe("b");
  });

  it("clamps at both ends", () => {
    expect(moveFocus(["a", "b", "c"], "a", -1)).toBe("a");
    expect(moveFocus(["a", "b", "c"], "c", 1)).toBe("c");
    expect(moveFocus(["a", "b", "c"], "b", 1)).toBe("c");
  });

  it("returns null for an empty list", () => {
    expect(moveFocus([], "a", 1)).toBeNull();
  });
});
