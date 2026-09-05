import { describe, expect, it } from "vitest";
import { deserializeSync } from "@xmcl/nbt";
import { DEFAULT_TINT, biomeTint, paintForBlock } from "@/shared/blockColors";
import {
  EMPTY_HEIGHT,
  REGION_PIXELS,
  composeRegionSurface,
  renderChunkColumns,
  renderChunkColumnsFromNbt,
  unpackIndices,
} from "./chunkSurface";
import {
  columnStack,
  flatChunkNbt,
  legacyNumericChunkNbt,
  levelChunkNbt,
  localIndex,
  packIndices,
  packIndicesSpanning,
} from "./chunkFixtures.test-helpers";

function parse(buffer: Buffer): unknown {
  return deserializeSync(new Uint8Array(buffer));
}

function rgbOf(paint: ReturnType<typeof paintForBlock>): number[] {
  return paint.kind === "solid" ? [...paint.rgb] : [];
}

describe("unpackIndices", () => {
  it("reads the 1.16+ layout where entries never straddle longs", () => {
    const indices = Array.from({ length: 4096 }, (_, index) => index % 7);
    const longs = packIndices(indices, 4);
    expect([...unpackIndices(longs, 4, 4096, false)]).toEqual(indices);

    const wide = Array.from({ length: 4096 }, (_, index) => index % 20);
    expect([...unpackIndices(packIndices(wide, 5), 5, 4096, false)]).toEqual(
      wide,
    );
  });

  it("reads the older bit stream that spans longs", () => {
    const indices = Array.from(
      { length: 4096 },
      (_, index) => (index * 7) % 23,
    );
    const longs = packIndicesSpanning(indices, 5);
    expect([...unpackIndices(longs, 5, 4096, true)]).toEqual(indices);
  });
});

describe("renderChunkColumns", () => {
  const palette = [
    "minecraft:air",
    "minecraft:stone",
    "minecraft:grass_block",
    "minecraft:water",
    "minecraft:sand",
  ];

  it("colours each column by its topmost visible block", () => {
    const data = columnStack((x, _z, y) => {
      if (x === 0) return y <= 3 ? 1 : y === 4 ? 2 : 0;
      if (x === 1) return y <= 2 ? 4 : y <= 4 ? 3 : 0;
      return 0;
    });
    const chunk = flatChunkNbt({
      x: 0,
      z: 0,
      sections: [{ y: 0, blocks: palette, data }],
    });
    const columns = renderChunkColumns(parse(chunk));

    expect(columns).not.toBeNull();
    const grass = columns!;
    expect([grass.colors[0], grass.colors[1], grass.colors[2]]).toEqual([
      ...DEFAULT_TINT.grass,
    ]);
    expect(grass.heights[0]).toBe(4);
    expect(grass.water[0]).toBe(0);

    const sand = rgbOf(paintForBlock("minecraft:sand"));
    expect(grass.heights[1]).toBe(4);
    expect(grass.water[1]).toBe(2);
    expect(grass.colors[1 * 3 + 2]).toBeGreaterThan(sand[2]);
    expect(grass.colors[1 * 3]).toBeLessThan(sand[0]);

    expect(grass.heights[2]).toBe(EMPTY_HEIGHT);
  });

  it("looks through empty sections and stacks them by height", () => {
    const chunk = flatChunkNbt({
      x: 0,
      z: 0,
      sections: [
        { y: 2, blocks: ["minecraft:air"] },
        { y: 1, blocks: ["minecraft:snow_block"] },
        { y: 0, blocks: ["minecraft:stone"] },
      ],
    });
    const columns = renderChunkColumns(parse(chunk))!;

    expect(columns.heights[0]).toBe(31);
    expect([columns.colors[0], columns.colors[1], columns.colors[2]]).toEqual(
      rgbOf(paintForBlock("minecraft:snow_block")),
    );
  });

  it("tints grass and water by biome", () => {
    const chunk = flatChunkNbt({
      x: 0,
      z: 0,
      sections: [
        {
          y: 0,
          blocks: ["minecraft:grass_block"],
          biomes: ["minecraft:swamp"],
        },
      ],
    });
    const columns = renderChunkColumns(parse(chunk))!;
    expect([columns.colors[0], columns.colors[1], columns.colors[2]]).toEqual([
      ...biomeTint("minecraft:swamp").grass,
    ]);
  });

  it("reads pre-1.18 sections, including the spanning bit layout", async () => {
    const wools = [
      "white",
      "orange",
      "magenta",
      "light_blue",
      "yellow",
      "lime",
      "pink",
      "gray",
      "light_gray",
      "cyan",
      "purple",
      "blue",
      "brown",
      "green",
      "red",
    ].map((color) => `minecraft:${color}_wool`);
    const names = ["minecraft:air", "minecraft:stone", ...wools];
    const data = columnStack((x, z, y) => {
      if (y <= 1) return 1;
      if (y === 2 && x === 0 && z === 0) return 5;
      return 0;
    });

    for (const dataVersion of [2230, 2586]) {
      const chunk = levelChunkNbt({
        x: 0,
        z: 0,
        dataVersion,
        sections: [{ y: 0, blocks: names, data }],
      });
      const columns = await renderChunkColumnsFromNbt(chunk);

      expect(columns).not.toBeNull();
      expect(columns!.heights[0]).toBe(2);
      expect([
        columns!.colors[0],
        columns!.colors[1],
        columns!.colors[2],
      ]).toEqual(rgbOf(paintForBlock(names[5])));
      expect(columns!.heights[1]).toBe(1);
      expect([
        columns!.colors[3],
        columns!.colors[4],
        columns!.colors[5],
      ]).toEqual(rgbOf(paintForBlock("minecraft:stone")));
    }
  });

  it("reports numeric-id chunks as unsupported", () => {
    expect(renderChunkColumns(parse(legacyNumericChunkNbt(0, 0)))).toBeNull();
    expect(renderChunkColumns("nope")).toBeNull();
  });
});

describe("composeRegionSurface", () => {
  it("places chunks in the region and shades slopes", () => {
    const low = renderChunkColumns(
      parse(
        flatChunkNbt({
          x: 0,
          z: 0,
          sections: [{ y: 0, blocks: ["minecraft:stone"] }],
        }),
      ),
    )!;
    const high = renderChunkColumns(
      parse(
        flatChunkNbt({
          x: 1,
          z: 0,
          sections: [
            { y: 1, blocks: ["minecraft:stone"] },
            { y: 0, blocks: ["minecraft:stone"] },
          ],
        }),
      ),
    )!;

    const surface = composeRegionSurface(
      new Map([
        [localIndex(0, 0), low],
        [localIndex(1, 0), high],
        [localIndex(3, 3), null],
      ]),
    );

    expect(surface.length).toBe(REGION_PIXELS * REGION_PIXELS * 4);

    const pixel = (x: number, z: number) => {
      const offset = (z * REGION_PIXELS + x) * 4;
      return [...surface.slice(offset, offset + 4)];
    };

    expect(pixel(0, 0)[3]).toBe(255);
    expect(pixel(40, 40)[3]).toBe(0);
    expect(pixel(3 * 16, 3 * 16)).toEqual([70, 70, 78, 255]);

    const edge = pixel(16, 5);
    const interior = pixel(20, 5);
    expect(edge[0]).toBeGreaterThan(interior[0]);

    const shadow = pixel(15, 5);
    const flat = pixel(8, 5);
    expect(shadow[0]).toBe(flat[0]);
    expect(pixel(24, 5)[0]).toBeGreaterThanOrEqual(flat[0]);
  });
});
