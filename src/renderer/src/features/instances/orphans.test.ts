import { describe, expect, it } from "vitest";
import { findOrphanFolders } from "./orphans";

describe("findOrphanFolders", () => {
  it("reports folders the launcher could not read as instances", () => {
    expect(
      findOrphanFolders(
        ["RLCraft", "Vanilla 26.2", "All the Mons"],
        ["Vanilla 26.2"],
      ),
    ).toEqual(["All the Mons", "RLCraft"]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(findOrphanFolders([" Vanilla 26.2 "], ["vanilla 26.2"])).toEqual([]);
  });

  it("removes duplicates and survives empty input", () => {
    expect(findOrphanFolders(["a", "a"], [])).toEqual(["a"]);
    expect(findOrphanFolders(undefined, undefined)).toEqual([]);
    expect(findOrphanFolders([""], [])).toEqual([]);
  });
});
