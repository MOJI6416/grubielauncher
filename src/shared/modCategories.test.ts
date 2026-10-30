import { describe, expect, it } from "vitest";
import {
  curseForgeCategories,
  isLibraryOnly,
  modrinthCategories,
} from "./modCategories";

describe("curseForgeCategories", () => {
  it("maps CurseForge categories onto the Modrinth names", () => {
    expect(
      curseForgeCategories([
        { id: 423, parentCategoryId: 6 },
        { id: 421, parentCategoryId: 6 },
      ]),
    ).toEqual(["utility", "library"]);
    expect(curseForgeCategories([{ id: 6814, parentCategoryId: 6 }])).toEqual([
      "optimization",
    ]);
  });

  it("folds subcategories into their parent unless they have a name of their own", () => {
    expect(
      curseForgeCategories([
        { id: 407, parentCategoryId: 406 },
        { id: 411, parentCategoryId: 406 },
        { id: 413, parentCategoryId: 412 },
        { id: 414, parentCategoryId: 412 },
      ]),
    ).toEqual(["worldgen", "mobs", "technology", "transportation"]);
  });

  it("drops categories that say nothing about the mod and repeats", () => {
    expect(
      curseForgeCategories([
        { id: 425, parentCategoryId: 6 },
        { id: 4906, parentCategoryId: 6 },
        { id: 4545, parentCategoryId: 426 },
        { id: 412, parentCategoryId: 6 },
        { id: 4558, parentCategoryId: 6 },
      ]),
    ).toEqual(["technology"]);
    expect(curseForgeCategories(undefined)).toEqual([]);
  });
});

describe("modrinthCategories", () => {
  it("keeps non-empty names once", () => {
    expect(modrinthCategories(["optimization", " Utility ", "", 4, "utility"])).toEqual([
      "optimization",
      "utility",
    ]);
    expect(modrinthCategories(null)).toEqual([]);
  });
});

describe("isLibraryOnly", () => {
  it("is true only when every category is a library", () => {
    expect(isLibraryOnly(["library"])).toBe(true);
    expect(isLibraryOnly(["utility", "library"])).toBe(false);
    expect(isLibraryOnly([])).toBe(false);
    expect(isLibraryOnly(undefined)).toBe(false);
  });
});
