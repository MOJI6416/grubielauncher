import { describe, expect, it } from "vitest";
import en from "../../../locales/en.json";
import ru from "../../../locales/ru.json";
import uk from "../../../locales/uk.json";
import {
  buildFace,
  buildSubject,
  crop,
  firstFrame,
  specPaths,
  texturePath,
  type TexturePack,
} from "./gameTextures";
import {
  LOGO_CATEGORIES,
  LOGO_PRESETS,
  findPreset,
  resolveSubject,
} from "./logoCatalog";
import {
  LOGO_BACKDROPS,
  renderBackdropSwatch,
  renderLogo,
  type Raster,
} from "./logoRender";
import type { Texture } from "./pixelArt";

function opaqueShare(raster: Raster): number {
  let opaque = 0;
  for (let index = 3; index < raster.pixels.length; index += 4) {
    if (raster.pixels[index] > 0) opaque++;
  }
  return opaque / (raster.size * raster.size);
}

function solid(
  width: number,
  height: number,
  color: (x: number, y: number) => [number, number, number, number],
): Texture {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.set(color(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, pixels };
}

function pixelAt(texture: Texture, x: number, y: number) {
  const index = (y * texture.width + x) * 4;
  return Array.from(texture.pixels.slice(index, index + 4));
}

function packOf(entries: Record<string, Texture>): TexturePack {
  return {
    id: "test",
    textures: new Map(
      Object.entries(entries).map(([name, texture]) => [
        texturePath(name),
        texture,
      ]),
    ),
  };
}

describe("logo catalog", () => {
  it("has unique ids in every category", () => {
    const ids = LOGO_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of LOGO_CATEGORIES) {
      expect(LOGO_PRESETS.some((preset) => preset.category === category)).toBe(
        true,
      );
    }
  });

  it("asks only for png textures of the game", () => {
    for (const preset of LOGO_PRESETS) {
      for (const path of specPaths(preset.spec)) {
        expect(path).toMatch(/^assets\/minecraft\/textures\/[a-z0-9_/]+\.png$/);
      }
    }
  });

  it.each([
    ["en", en],
    ["ru", ru],
    ["uk", uk],
  ])("names every preset and backdrop in %s", (_, bundle) => {
    const names = bundle.logoPicker;
    for (const preset of LOGO_PRESETS) {
      expect(
        names.presets[preset.id as keyof typeof names.presets],
      ).toBeTruthy();
    }
    for (const backdrop of LOGO_BACKDROPS) {
      expect(
        names.backdrops[backdrop.id as keyof typeof names.backdrops],
      ).toBeTruthy();
    }
  });

  it("offers nothing without the game", () => {
    for (const preset of LOGO_PRESETS) {
      expect(resolveSubject(preset, null)).toBeNull();
    }
  });
});

describe("game textures", () => {
  it("keeps only the first frame of an animated strip", () => {
    const strip = solid(2, 6, (_, y) => [y * 10, 0, 0, 255]);
    const frame = firstFrame(strip);
    expect([frame.width, frame.height]).toEqual([2, 2]);
    expect(pixelAt(frame, 0, 1)).toEqual([10, 0, 0, 255]);
  });

  it("crops a model region and refuses one outside the texture", () => {
    const texture = solid(8, 4, (x, y) => [x, y, 0, 255]);
    expect(pixelAt(crop(texture, [2, 1, 3, 2])!, 1, 1)).toEqual([3, 2, 0, 255]);
    expect(crop(texture, [6, 0, 4, 2])).toBeNull();
  });

  it("tints grass and lays the overlay on top", () => {
    const pack = packOf({
      "block/grass_block_side": solid(16, 16, () => [90, 60, 30, 255]),
      "block/grass_block_side_overlay": solid(16, 16, (_, y) =>
        y < 4 ? [255, 255, 255, 255] : [0, 0, 0, 0],
      ),
    });
    const side = buildFace(
      [
        { from: [{ path: texturePath("block/grass_block_side") }] },
        {
          from: [{ path: texturePath("block/grass_block_side_overlay") }],
          tint: "grass",
        },
      ],
      pack,
    )!;
    expect(pixelAt(side, 3, 1)).toEqual([145, 189, 89, 255]);
    expect(pixelAt(side, 3, 10)).toEqual([90, 60, 30, 255]);
  });

  it("reads model regions from double resolution textures", () => {
    const pack = packOf({
      "entity/pig/pig": solid(128, 64, (x, y) => [x, y, 7, 255]),
    });
    const pig = buildSubject(findPreset("pig")!.spec, pack);
    if (pig?.kind !== "cube") throw new Error("pig is not a cube");
    expect([pig.faces.front.width, pig.faces.front.height]).toEqual([16, 16]);
    expect(pixelAt(pig.faces.front, 0, 0)).toEqual([16, 16, 7, 255]);
    expect(pixelAt(pig.faces.front, 4, 8)).toEqual([34, 34, 7, 255]);
  });

  it("uses the next path when the newer one is missing", () => {
    const pack = packOf({
      "entity/pig/pig": solid(64, 32, (x, y) => [x, y, 7, 255]),
    });
    const pig = buildSubject(findPreset("pig")!.spec, pack);
    expect(pig?.kind).toBe("cube");
    if (pig?.kind !== "cube") return;
    expect(pixelAt(pig.faces.front, 0, 0)).toEqual([8, 8, 7, 255]);
    expect(pixelAt(pig.faces.front, 2, 4)).toEqual([17, 17, 7, 255]);
  });

  it("puts the hat layer over the face", () => {
    const pack = packOf({
      "entity/zombie/zombie": solid(64, 64, (x, y) =>
        x >= 40 && x < 48 && y >= 8 && y < 16 && x === 40
          ? [255, 0, 0, 255]
          : x >= 32
            ? [0, 0, 0, 0]
            : [10, 20, 30, 255],
      ),
    });
    const zombie = buildSubject(findPreset("zombie")!.spec, pack);
    if (zombie?.kind !== "cube") throw new Error("zombie is not a cube");
    expect(pixelAt(zombie.faces.front, 0, 3)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(zombie.faces.front, 1, 3)).toEqual([10, 20, 30, 255]);
  });

  it("hides a preset whose textures the version lacks", () => {
    expect(buildSubject(findPreset("sculk")!.spec, packOf({}))).toBeNull();
  });
});

describe("logo raster", () => {
  const blockPack = packOf({
    "block/dirt": solid(16, 16, (x, y) => [100 + x, 60 + y, 30, 255]),
  });

  it("draws a block from the game texture", () => {
    const share = opaqueShare(
      renderLogo(resolveSubject(findPreset("dirt")!, blockPack), "none", 64),
    );
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.95);
  });

  it("renders the same picture every time", () => {
    const subject = resolveSubject(findPreset("dirt")!, blockPack);
    const first = renderLogo(subject, "night", 48);
    const second = renderLogo(subject, "night", 48);
    expect(Buffer.from(first.pixels).equals(Buffer.from(second.pixels))).toBe(
      true,
    );
  });

  it("fills the whole square when a backdrop is chosen", () => {
    const subject = resolveSubject(findPreset("dirt")!, blockPack);
    for (const backdrop of LOGO_BACKDROPS) {
      if (backdrop.id === "none") continue;
      expect(opaqueShare(renderLogo(subject, backdrop.id, 64))).toBe(1);
      expect(opaqueShare(renderBackdropSwatch(backdrop.id, 16))).toBe(1);
    }
  });
});
