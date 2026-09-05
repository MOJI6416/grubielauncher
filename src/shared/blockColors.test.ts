import { describe, expect, it } from "vitest";
import {
  DEFAULT_TINT,
  DYE_COLORS,
  biomeTint,
  isTransparentBlock,
  isWaterLike,
  paintForBlock,
  resolvePaint,
} from "./blockColors";

describe("paintForBlock", () => {
  it("knows the common terrain blocks", () => {
    expect(paintForBlock("minecraft:stone")).toEqual({
      kind: "solid",
      rgb: [125, 125, 125],
    });
    expect(paintForBlock("minecraft:grass_block")).toEqual({ kind: "grass" });
    expect(paintForBlock("minecraft:oak_leaves")).toEqual({ kind: "foliage" });
    expect(paintForBlock("minecraft:water")).toEqual({ kind: "water" });
    expect(paintForBlock("minecraft:air")).toEqual({ kind: "transparent" });
  });

  it("derives dyed, wooden and stained blocks from their prefix", () => {
    expect(paintForBlock("minecraft:red_wool")).toEqual({
      kind: "solid",
      rgb: DYE_COLORS.red,
    });
    expect(paintForBlock("minecraft:light_blue_concrete")).toEqual({
      kind: "solid",
      rgb: DYE_COLORS.light_blue,
    });
    expect(paintForBlock("minecraft:lime_terracotta")).not.toEqual(
      paintForBlock("minecraft:lime_wool"),
    );
    expect(paintForBlock("minecraft:stripped_spruce_log")).toEqual(
      paintForBlock("minecraft:spruce_log"),
    );
    expect(paintForBlock("minecraft:dark_oak_stairs")).toEqual(
      paintForBlock("minecraft:dark_oak_planks"),
    );
    expect(paintForBlock("minecraft:purple_stained_glass")).toEqual({
      kind: "transparent",
    });
    expect(paintForBlock("minecraft:tinted_glass").kind).toBe("solid");
  });

  it("gives unknown blocks a stable muted colour", () => {
    const first = paintForBlock("create:brass_casing");
    const again = paintForBlock("create:brass_casing");
    const other = paintForBlock("create:copper_casing");

    expect(first).toBe(again);
    expect(first.kind).toBe("solid");
    expect(other.kind).toBe("solid");
    if (first.kind === "solid" && other.kind === "solid") {
      expect(first.rgb).not.toEqual(other.rgb);
      for (const channel of first.rgb) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it("classifies water-like and see-through blocks", () => {
    expect(isWaterLike("minecraft:kelp")).toBe(true);
    expect(isWaterLike("minecraft:sand")).toBe(false);
    expect(isTransparentBlock("minecraft:glass_pane")).toBe(true);
    expect(isTransparentBlock("minecraft:cave_air")).toBe(true);
    expect(isTransparentBlock("minecraft:torch")).toBe(false);
  });
});

describe("biome tints", () => {
  it("falls back to the plains palette", () => {
    expect(biomeTint(null)).toBe(DEFAULT_TINT);
    expect(biomeTint("minecraft:lush_caves")).toEqual(DEFAULT_TINT);
    expect(biomeTint("minecraft:swamp").water).toEqual([97, 123, 100]);
    expect(biomeTint("minecraft:frozen_river").grass).toEqual(
      DEFAULT_TINT.grass,
    );
  });

  it("resolves paints under a tint", () => {
    const tint = biomeTint("minecraft:jungle");
    expect(resolvePaint({ kind: "grass" }, tint)).toEqual(tint.grass);
    expect(resolvePaint({ kind: "foliage" }, tint)).toEqual(tint.foliage);
    expect(resolvePaint({ kind: "water" }, tint)).toEqual(tint.water);
    expect(resolvePaint({ kind: "solid", rgb: [1, 2, 3] }, tint)).toEqual([
      1, 2, 3,
    ]);
    expect(resolvePaint({ kind: "transparent" }, tint)).toBeNull();
  });
});
