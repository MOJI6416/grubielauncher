import { describe, expect, it } from "vitest";
import { IWorld } from "@/types/World";
import {
  availableWorldFilters,
  buildWorldList,
  countWorldFilters,
  duplicateWorldNames,
  matchesWorldFilter,
  matchesWorldQuery,
  pickSelectedFolder,
  sortWorldItems,
  toWorldItems,
} from "./worldsList";

function world(partial: Partial<IWorld> & { name: string }): IWorld {
  return {
    seed: "",
    folderName: partial.name,
    path: `/saves/${partial.name}`,
    isDownloaded: false,
    datapacks: [],
    ...partial,
  };
}

const alpha = world({
  name: "Alpha",
  seed: "-4207",
  gameMode: "survival",
  lastPlayed: 3000,
  versionName: "1.20.1",
});
const bravo = world({
  name: "bravo",
  gameMode: "creative",
  lastPlayed: 1000,
});
const charlie = world({
  name: "Charlie",
  gameMode: "survival",
  hardcore: true,
  lastPlayed: 2000,
});

const worlds = [alpha, bravo, charlie];
const sizes = { Alpha: 500, bravo: 1500, Charlie: 100 };
const backups = { Alpha: 2 };
const playTime = { Alpha: 10, bravo: 90, Charlie: 50 };

describe("matchesWorldQuery", () => {
  it("matches an empty query", () => {
    expect(matchesWorldQuery(alpha, "   ")).toBe(true);
  });

  it("matches case-insensitively on the name", () => {
    expect(matchesWorldQuery(alpha, "ALPH")).toBe(true);
    expect(matchesWorldQuery(alpha, "zzz")).toBe(false);
  });

  it("matches on seed and world version", () => {
    expect(matchesWorldQuery(alpha, "4207")).toBe(true);
    expect(matchesWorldQuery(alpha, "1.20")).toBe(true);
  });
});

describe("matchesWorldFilter", () => {
  it("passes everything for all", () => {
    expect(worlds.every((entry) => matchesWorldFilter(entry, "all"))).toBe(true);
  });

  it("treats hardcore as its own filter", () => {
    expect(matchesWorldFilter(charlie, "hardcore")).toBe(true);
    expect(matchesWorldFilter(alpha, "hardcore")).toBe(false);
  });

  it("keeps a hardcore world inside its game mode", () => {
    expect(matchesWorldFilter(charlie, "survival")).toBe(true);
  });
});

describe("countWorldFilters", () => {
  it("counts modes and hardcore independently", () => {
    expect(countWorldFilters(worlds)).toEqual({
      all: 3,
      hardcore: 1,
      survival: 2,
      creative: 1,
      adventure: 0,
      spectator: 0,
    });
  });

  it("only offers filters that match something", () => {
    expect(availableWorldFilters(worlds)).toEqual([
      "all",
      "hardcore",
      "survival",
      "creative",
    ]);
  });
});

describe("sortWorldItems", () => {
  const items = toWorldItems({ worlds, sizes, backups, playTime });

  it("sorts by last played first by default", () => {
    expect(
      sortWorldItems(items, "recent").map((item) => item.world.name),
    ).toEqual(["Alpha", "Charlie", "bravo"]);
  });

  it("sorts by name case-insensitively", () => {
    expect(sortWorldItems(items, "name").map((item) => item.world.name)).toEqual(
      ["Alpha", "bravo", "Charlie"],
    );
  });

  it("sorts by size descending", () => {
    expect(sortWorldItems(items, "size").map((item) => item.world.name)).toEqual(
      ["bravo", "Alpha", "Charlie"],
    );
  });

  it("sorts by play time descending", () => {
    expect(
      sortWorldItems(items, "playtime").map((item) => item.world.name),
    ).toEqual(["bravo", "Charlie", "Alpha"]);
  });

  it("pushes worlds with an unknown size to the end", () => {
    const partial = toWorldItems({
      worlds,
      sizes: { Alpha: 10 },
      backups,
      playTime,
    });

    expect(
      sortWorldItems(partial, "size").map((item) => item.world.name),
    ).toEqual(["Alpha", "bravo", "Charlie"]);
  });

  it("does not mutate the input", () => {
    const original = items.map((item) => item.world.name);
    sortWorldItems(items, "name");
    expect(items.map((item) => item.world.name)).toEqual(original);
  });
});

describe("toWorldItems", () => {
  it("keeps an unknown size as null and missing counters as zero", () => {
    const [first] = toWorldItems({
      worlds: [bravo],
      sizes: {},
      backups: {},
      playTime: {},
    });

    expect(first.sizeBytes).toBeNull();
    expect(first.backups).toBe(0);
    expect(first.playTimeTicks).toBe(0);
  });

  it("keeps a zero size distinguishable from an unknown one", () => {
    const [first] = toWorldItems({
      worlds: [bravo],
      sizes: { bravo: 0 },
      backups: {},
      playTime: {},
    });

    expect(first.sizeBytes).toBe(0);
  });
});

describe("buildWorldList", () => {
  it("filters, searches and sorts together", () => {
    const result = buildWorldList({
      worlds,
      sizes,
      backups,
      playTime,
      query: "a",
      filter: "survival",
      sort: "name",
    });

    expect(result.map((item) => item.world.name)).toEqual(["Alpha", "Charlie"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(
      buildWorldList({
        worlds,
        sizes,
        backups,
        playTime,
        query: "nothing",
        filter: "all",
        sort: "recent",
      }),
    ).toEqual([]);
  });
});

describe("pickSelectedFolder", () => {
  const items = toWorldItems({ worlds, sizes, backups, playTime });

  it("keeps the current selection when it survives filtering", () => {
    expect(pickSelectedFolder(items, "bravo")).toBe("bravo");
  });

  it("falls back to the first item when the selection is gone", () => {
    expect(pickSelectedFolder(items, "deleted")).toBe("Alpha");
  });

  it("returns null for an empty list", () => {
    expect(pickSelectedFolder([], "Alpha")).toBeNull();
  });
});

describe("duplicateWorldNames", () => {
  it("reports only the names shared by more than one world", () => {
    const duplicates = duplicateWorldNames([
      world({ name: "Канто", folderName: "World 1" }),
      world({ name: "Канто", folderName: "World 2" }),
      world({ name: "Свежий мир", folderName: "World 9" }),
    ]);

    expect([...duplicates]).toEqual(["Канто"]);
  });

  it("returns nothing when every name is unique", () => {
    expect(
      duplicateWorldNames([world({ name: "A" }), world({ name: "B" })]).size,
    ).toBe(0);
  });
});
