import { describe, expect, it } from "vitest";
import {
  blurBlock,
  clipRect,
  debugScreenRect,
  editedName,
  intoCrop,
  isUsableRect,
  outputSize,
  pixelate,
  rectFromPoints,
} from "./imageEdits";

function image(width: number, height: number, pick: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = pick(x, y);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number) {
  return data[(y * width + x) * 4];
}

describe("blur", () => {
  it("turns each block of the region into one average colour", () => {
    const data = image(4, 4, (x, y) => (x + y) % 2 === 0 ? 0 : 200);
    pixelate(data, 4, 4, { x: 0, y: 0, w: 4, h: 4 }, 2);

    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        expect(pixel(data, 4, x, y)).toBe(100);
      }
    }
  });

  it("leaves everything outside the region as it was", () => {
    const data = image(6, 4, (x) => x * 40);
    const before = data.slice();
    pixelate(data, 6, 4, { x: 2, y: 0, w: 2, h: 4 }, 2);

    for (let y = 0; y < 4; y += 1) {
      for (const x of [0, 1, 4, 5]) {
        expect(pixel(data, 6, x, y)).toBe(pixel(before, 6, x, y));
      }
      expect(pixel(data, 6, 2, y)).toBe(100);
      expect(pixel(data, 6, 3, y)).toBe(100);
    }
  });

  it("hides text: no pixel of a nickname survives inside a block", () => {
    const width = 32;
    const height = 16;
    const data = image(width, height, (x, y) =>
      y >= 4 && y < 12 && x % 3 === 0 ? 255 : 0,
    );
    const block = blurBlock({ x: 0, y: 0, w: width, h: height }, 1920);
    pixelate(data, width, height, { x: 0, y: 0, w: width, h: height }, block);

    const values = new Set<number>();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) values.add(pixel(data, width, x, y));
    }
    expect(values.has(255)).toBe(false);
    expect(values.size).toBeLessThanOrEqual(Math.ceil(width / block) * Math.ceil(height / block));
  });

  it("keeps blocks big enough on large screenshots", () => {
    expect(blurBlock({ x: 0, y: 0, w: 200, h: 24 }, 1920)).toBe(16);
    expect(blurBlock({ x: 0, y: 0, w: 200, h: 24 }, 3840)).toBe(32);
    expect(blurBlock({ x: 0, y: 0, w: 10, h: 10 }, 320)).toBe(6);
    expect(blurBlock({ x: 0, y: 0, w: 2000, h: 2000 }, 1920)).toBe(96);
  });

  it("clips a region that runs past the image edge", () => {
    const data = image(4, 4, () => 50);
    expect(() =>
      pixelate(data, 4, 4, { x: 2, y: 2, w: 10, h: 10 }, 3),
    ).not.toThrow();
    expect(pixel(data, 4, 3, 3)).toBe(50);
  });

  it("covers the F3 debug text on the left", () => {
    expect(debugScreenRect({ width: 1920, height: 1080 })).toEqual({
      x: 0,
      y: 0,
      w: 806,
      h: 540,
    });
  });
});

describe("crop", () => {
  it("builds a rectangle from a drag in any direction, inside the image", () => {
    expect(
      rectFromPoints({ x: 120, y: 90 }, { x: -20, y: 10 }, { width: 100, height: 80 }),
    ).toEqual({ x: 0, y: 10, w: 100, h: 70 });
  });

  it("ignores a click that is not a real selection", () => {
    expect(isUsableRect({ x: 0, y: 0, w: 3, h: 40 })).toBe(false);
    expect(isUsableRect({ x: 0, y: 0, w: 40, h: 40 })).toBe(true);
    expect(isUsableRect(null)).toBe(false);
  });

  it("moves blur regions into the cropped picture", () => {
    const crop = { x: 100, y: 50, w: 200, h: 100 };
    expect(intoCrop({ x: 90, y: 60, w: 50, h: 20 }, crop)).toEqual({
      x: 0,
      y: 10,
      w: 40,
      h: 20,
    });
    expect(intoCrop({ x: 0, y: 0, w: 50, h: 20 }, crop)).toBeNull();
    expect(intoCrop({ x: 5, y: 5, w: 5, h: 5 }, null)).toEqual({
      x: 5,
      y: 5,
      w: 5,
      h: 5,
    });
  });

  it("outputs the crop size, or the whole picture without a crop", () => {
    expect(outputSize({ width: 1920, height: 1080 }, { x: 10, y: 10, w: 640, h: 360 })).toEqual({
      width: 640,
      height: 360,
    });
    expect(outputSize({ width: 1920, height: 1080 }, null)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(clipRect({ x: 50, y: 50, w: 10, h: 10 }, { width: 40, height: 40 })).toBeNull();
  });
});

describe("edited copy", () => {
  it("is saved next to the original without overwriting anything", () => {
    expect(editedName("2026-11-20_14.03.22.png", [])).toBe(
      "2026-11-20_14.03.22_edit.png",
    );
    expect(
      editedName("2026-11-20_14.03.22.png", [
        "2026-11-20_14.03.22_EDIT.png",
        "2026-11-20_14.03.22_edit2.png",
      ]),
    ).toBe("2026-11-20_14.03.22_edit3.png");
  });
});
