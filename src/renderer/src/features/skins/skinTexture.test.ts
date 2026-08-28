import { describe, expect, it } from "vitest";
import {
  computeCapeScale,
  createPixelImage,
  cropSkinHead,
  inferSkinModel,
  inspectCapeTexture,
  inspectSkinTexture,
  isSupportedCapeSize,
  isSupportedSkinSize,
  readPngSize,
  upgradeLegacySkin,
  MAX_SKIN_TEXTURE_BYTES,
} from "./skinTexture";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);

  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);

  return bytes;
}

function fill(
  image: ReturnType<typeof createPixelImage>,
  color: [number, number, number, number],
): void {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = color[0];
    image.data[offset + 1] = color[1];
    image.data[offset + 2] = color[2];
    image.data[offset + 3] = color[3];
  }
}

function setPixel(
  image: ReturnType<typeof createPixelImage>,
  x: number,
  y: number,
  color: [number, number, number, number],
): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

function getPixel(
  image: ReturnType<typeof createPixelImage>,
  x: number,
  y: number,
): [number, number, number, number] {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3],
  ];
}

describe("readPngSize", () => {
  it("reads dimensions out of the IHDR chunk", () => {
    expect(readPngSize(pngHeader(64, 32))).toEqual({ width: 64, height: 32 });
  });

  it("rejects data that is not a PNG", () => {
    expect(readPngSize(new Uint8Array(64))).toBeNull();
  });

  it("rejects truncated data", () => {
    expect(readPngSize(pngHeader(64, 64).slice(0, 20))).toBeNull();
  });
});

describe("isSupportedSkinSize", () => {
  it("accepts modern and legacy geometry", () => {
    expect(isSupportedSkinSize({ width: 64, height: 64 })).toBe(true);
    expect(isSupportedSkinSize({ width: 64, height: 32 })).toBe(true);
    expect(isSupportedSkinSize({ width: 128, height: 128 })).toBe(true);
    expect(isSupportedSkinSize({ width: 512, height: 256 })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSupportedSkinSize(null)).toBe(false);
    expect(isSupportedSkinSize({ width: 32, height: 32 })).toBe(false);
    expect(isSupportedSkinSize({ width: 64, height: 48 })).toBe(false);
    expect(isSupportedSkinSize({ width: 2048, height: 2048 })).toBe(false);
  });
});

describe("inspectSkinTexture", () => {
  it("reports legacy textures", () => {
    const result = inspectSkinTexture(pngHeader(64, 32));
    expect(result).toEqual({
      ok: true,
      info: { width: 64, height: 32, scale: 1, legacy: true },
    });
  });

  it("reports high resolution modern textures", () => {
    const result = inspectSkinTexture(pngHeader(256, 256));
    expect(result.ok && result.info.scale).toBe(4);
    expect(result.ok && result.info.legacy).toBe(false);
  });

  it("names the reason for every rejection", () => {
    expect(inspectSkinTexture(null)).toEqual({ ok: false, problem: "empty" });
    expect(inspectSkinTexture(new Uint8Array(0))).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(inspectSkinTexture(new Uint8Array(40))).toEqual({
      ok: false,
      problem: "notPng",
    });
    expect(inspectSkinTexture(pngHeader(70, 70))).toEqual({
      ok: false,
      problem: "unsupportedSize",
    });

    const huge = new Uint8Array(MAX_SKIN_TEXTURE_BYTES + 1);
    huge.set(pngHeader(64, 64), 0);
    expect(inspectSkinTexture(huge)).toEqual({ ok: false, problem: "tooLarge" });
  });
});

describe("cape geometry", () => {
  it("accepts the three known cape aspect ratios", () => {
    expect(computeCapeScale({ width: 64, height: 32 })).toBe(1);
    expect(computeCapeScale({ width: 22, height: 17 })).toBe(1);
    expect(computeCapeScale({ width: 46, height: 22 })).toBe(1);
    expect(computeCapeScale({ width: 512, height: 256 })).toBe(8);
    expect(isSupportedCapeSize({ width: 128, height: 64 })).toBe(true);
  });

  it("rejects unknown ratios", () => {
    expect(computeCapeScale({ width: 30, height: 30 })).toBeNull();
    expect(isSupportedCapeSize(null)).toBe(false);
    expect(inspectCapeTexture(pngHeader(30, 30))).toEqual({
      ok: false,
      problem: "unsupportedSize",
    });
    expect(inspectCapeTexture(pngHeader(64, 32)).ok).toBe(true);
  });
});

describe("upgradeLegacySkin", () => {
  it("keeps modern textures untouched", () => {
    const image = createPixelImage(64, 64);
    expect(upgradeLegacySkin(image)).toBe(image);
  });

  it("grows a 64x32 texture into 64x64", () => {
    const image = createPixelImage(64, 32);
    const upgraded = upgradeLegacySkin(image);

    expect(upgraded.width).toBe(64);
    expect(upgraded.height).toBe(64);
  });

  it("mirrors the right arm onto the left arm", () => {
    const image = createPixelImage(64, 32);
    setPixel(image, 44, 20, [10, 20, 30, 255]);

    const upgraded = upgradeLegacySkin(image);

    expect(getPixel(upgraded, 44, 20)).toEqual([10, 20, 30, 255]);
    expect(getPixel(upgraded, 39, 52)).toEqual([10, 20, 30, 255]);
  });

  it("mirrors the right leg onto the left leg", () => {
    const image = createPixelImage(64, 32);
    setPixel(image, 4, 20, [1, 2, 3, 255]);

    const upgraded = upgradeLegacySkin(image);

    expect(getPixel(upgraded, 23, 52)).toEqual([1, 2, 3, 255]);
  });

  it("scales the mapping for high resolution legacy textures", () => {
    const image = createPixelImage(128, 64);
    setPixel(image, 88, 40, [9, 9, 9, 255]);

    const upgraded = upgradeLegacySkin(image);

    expect(upgraded.width).toBe(128);
    expect(upgraded.height).toBe(128);
    expect(getPixel(upgraded, 79, 104)).toEqual([9, 9, 9, 255]);
  });
});

describe("inferSkinModel", () => {
  it("treats an opaque texture as classic", () => {
    const image = createPixelImage(64, 64);
    fill(image, [120, 90, 60, 255]);

    expect(inferSkinModel(image)).toBe("classic");
  });

  it("detects slim arms by transparent gaps", () => {
    const image = createPixelImage(64, 64);
    fill(image, [120, 90, 60, 255]);
    setPixel(image, 54, 25, [0, 0, 0, 0]);

    expect(inferSkinModel(image)).toBe("slim");
  });

  it("detects slim arms when the unused areas are fully black", () => {
    const image = createPixelImage(64, 64);
    fill(image, [120, 90, 60, 255]);
    for (const [x, y, width, height] of [
      [50, 16, 2, 4],
      [54, 20, 2, 12],
      [42, 48, 2, 4],
      [46, 52, 2, 12],
    ]) {
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          setPixel(image, x + column, y + row, [0, 0, 0, 255]);
        }
      }
    }

    expect(inferSkinModel(image)).toBe("slim");
  });

  it("works on legacy textures without crashing", () => {
    const image = createPixelImage(64, 32);
    fill(image, [10, 10, 10, 255]);

    expect(["slim", "classic"]).toContain(inferSkinModel(image));
  });
});

describe("cropSkinHead", () => {
  it("cuts an 8x8 head at scale 1", () => {
    const image = createPixelImage(64, 64);
    setPixel(image, 8, 8, [5, 6, 7, 255]);

    const head = cropSkinHead(image, { overlay: false });

    expect(head.width).toBe(8);
    expect(head.height).toBe(8);
    expect(getPixel(head, 0, 0)).toEqual([5, 6, 7, 255]);
  });

  it("composites the hat layer over the base head", () => {
    const image = createPixelImage(64, 64);
    setPixel(image, 8, 8, [0, 0, 0, 255]);
    setPixel(image, 40, 8, [255, 255, 255, 255]);

    const head = cropSkinHead(image);

    expect(getPixel(head, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it("ignores a fully transparent hat layer", () => {
    const image = createPixelImage(64, 64);
    setPixel(image, 8, 8, [10, 20, 30, 255]);
    setPixel(image, 40, 8, [255, 255, 255, 0]);

    const head = cropSkinHead(image);

    expect(getPixel(head, 0, 0)).toEqual([10, 20, 30, 255]);
  });

  it("scales with the texture resolution", () => {
    const image = createPixelImage(128, 128);

    expect(cropSkinHead(image).width).toBe(16);
  });

  it("reads the head of a legacy texture", () => {
    const image = createPixelImage(64, 32);
    setPixel(image, 10, 10, [3, 3, 3, 255]);

    const head = cropSkinHead(image, { overlay: false });

    expect(getPixel(head, 2, 2)).toEqual([3, 3, 3, 255]);
  });
});
