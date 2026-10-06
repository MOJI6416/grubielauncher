import { describe, expect, it } from "vitest";
import {
  FIT_VIEW,
  clampView,
  fitSize,
  isZoomed,
  stepScale,
  toggleTarget,
  wheelScale,
  zoomAt,
  zoomLimit,
  zoomPercent,
} from "./zoom";

const stage = { width: 1000, height: 600 };

describe("fitSize", () => {
  it("shrinks a large image into the stage keeping its ratio", () => {
    const fit = fitSize({ width: 3840, height: 2160 }, stage);
    expect(fit.width).toBeCloseTo(1000);
    expect(fit.height).toBeCloseTo(562.5);
  });

  it("never upscales a small image", () => {
    expect(fitSize({ width: 128, height: 64 }, stage)).toEqual({
      width: 128,
      height: 64,
    });
  });

  it("returns an empty size until both sides are known", () => {
    expect(fitSize({ width: 0, height: 0 }, stage)).toEqual({
      width: 0,
      height: 0,
    });
    expect(fitSize({ width: 100, height: 100 }, { width: 0, height: 0 })).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe("zoomAt", () => {
  it("keeps the point under the cursor still", () => {
    const view = zoomAt(FIT_VIEW, 2, { x: 100, y: -50 });
    const before = { x: (100 - FIT_VIEW.x) / FIT_VIEW.scale, y: (-50 - FIT_VIEW.y) / FIT_VIEW.scale };
    const after = { x: (100 - view.x) / view.scale, y: (-50 - view.y) / view.scale };
    expect(after).toEqual(before);
  });

  it("zooms around the centre without moving it", () => {
    expect(zoomAt(FIT_VIEW, 3, { x: 0, y: 0 })).toEqual({ scale: 3, x: 0, y: 0 });
  });
});

describe("clampView", () => {
  const fit = { width: 1000, height: 562.5 };

  it("keeps the image inside the stage while panning", () => {
    const view = clampView({ scale: 2, x: 5000, y: -5000 }, fit, stage, 10);
    expect(view.x).toBe(500);
    expect(view.y).toBeCloseTo(-262.5);
  });

  it("centres an axis the image does not overflow", () => {
    const view = clampView({ scale: 1, x: 80, y: 40 }, fit, stage, 10);
    expect(view).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("does not zoom below fit or above the limit", () => {
    expect(clampView({ scale: 0.2, x: 0, y: 0 }, fit, stage, 10).scale).toBe(1);
    expect(clampView({ scale: 50, x: 0, y: 0 }, fit, stage, 10).scale).toBe(10);
  });
});

describe("zoom limits", () => {
  it("allows four times the real pixels of a big image", () => {
    const natural = { width: 4000, height: 2000 };
    const fit = fitSize(natural, stage);
    expect(zoomLimit(natural, fit)).toBeCloseTo(16);
  });

  it("still allows a fourfold zoom of a small image", () => {
    const natural = { width: 100, height: 100 };
    expect(zoomLimit(natural, fitSize(natural, stage))).toBe(4);
  });

  it("toggles to real pixels when the image was shrunk, otherwise to 2x", () => {
    const big = { width: 4000, height: 2000 };
    expect(toggleTarget(big, fitSize(big, stage))).toBe(4);
    const small = { width: 300, height: 200 };
    expect(toggleTarget(small, fitSize(small, stage))).toBe(2);
  });
});

describe("zoom steps", () => {
  it("zooms in on a negative wheel delta and out on a positive one", () => {
    expect(wheelScale(1, -100)).toBeGreaterThan(1);
    expect(wheelScale(2, 100)).toBeLessThan(2);
  });

  it("steps are symmetric", () => {
    expect(stepScale(stepScale(1, 1), -1)).toBeCloseTo(1);
  });

  it("reports zoom relative to the real pixels", () => {
    const natural = { width: 2000, height: 1000 };
    const fit = fitSize(natural, stage);
    expect(zoomPercent(FIT_VIEW, natural, fit)).toBe(50);
    expect(zoomPercent({ scale: 2, x: 0, y: 0 }, natural, fit)).toBe(100);
    expect(isZoomed(FIT_VIEW)).toBe(false);
    expect(isZoomed({ scale: 1.5, x: 0, y: 0 })).toBe(true);
  });
});
