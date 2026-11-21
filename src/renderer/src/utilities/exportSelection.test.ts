import { describe, expect, it } from "vitest";
import {
  initialSelection,
  normalizeExportPrefs,
  selectedTopFolders,
  sortExportNames,
  worldKey,
} from "./exportSelection";

describe("initialSelection", () => {
  const keys = ["mods", "config", "server", worldKey("Home"), worldKey("Old")];

  it("leaves worlds and the server out by default", () => {
    expect([...initialSelection(keys, null)]).toEqual(["mods", "config"]);
  });

  it("restores the last choice and defaults only new entries", () => {
    const selection = initialSelection([...keys, "kubejs", worldKey("New")], {
      format: "grubie",
      selected: ["mods", worldKey("Home"), "server"],
      known: keys,
    });
    expect([...selection]).toEqual(["mods", "server", worldKey("Home"), "kubejs"]);
  });
});

describe("sortExportNames", () => {
  it("puts the usual folders first and the rest by name", () => {
    expect(sortExportNames(["zeta", "saves", "Alpha", "config", "mods", "options.txt"])).toEqual([
      "mods",
      "config",
      "saves",
      "options.txt",
      "Alpha",
      "zeta",
    ]);
  });
});

describe("selectedTopFolders", () => {
  it("counts a picked world as the worlds folder", () => {
    expect([...selectedTopFolders(new Set(["mods", worldKey("Home")]))]).toEqual(["mods", "saves"]);
  });
});

describe("normalizeExportPrefs", () => {
  it("survives broken storage", () => {
    expect(normalizeExportPrefs("nope")).toBeNull();
    expect(normalizeExportPrefs({ format: "zip", selected: [1, "mods"], known: null })).toEqual({
      format: "grubie",
      selected: ["mods"],
      known: [],
    });
  });
});
