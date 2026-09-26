import { describe, expect, it } from "vitest";
import { pickArtTint } from "./artTint";

function fill(color: [number, number, number, number], count: number) {
  return Array.from({ length: count }, () => color).flat();
}

describe("pickArtTint", () => {
  it("returns the hue of a saturated image", () => {
    expect(pickArtTint(fill([220, 40, 40, 255], 16))).toBe("hsl(0 72% 60%)");
  });

  it("lets saturated pixels outweigh a grey background", () => {
    const pixels = [...fill([90, 90, 90, 255], 48), ...fill([40, 90, 230, 255], 16)];
    const tint = pickArtTint(pixels);
    expect(tint).not.toBeNull();
    expect(Number(tint!.match(/^hsl\((\d+)/)![1])).toBeGreaterThan(200);
  });

  it("gives no tint for greyscale art", () => {
    expect(pickArtTint(fill([128, 128, 128, 255], 16))).toBeNull();
  });

  it("skips transparent pixels", () => {
    expect(pickArtTint(fill([220, 40, 40, 0], 16))).toBeNull();
  });
});
