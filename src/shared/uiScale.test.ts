import { describe, expect, it } from "vitest";
import {
  fitUiScale,
  formatUiScale,
  normalizeUiScale,
  scaledSize,
  stepUiScale,
  uiScaleOptions,
} from "./uiScale";

const BASE = { width: 1280, height: 720 };
const FULL_HD = { width: 1920, height: 1032 };
const QHD = { width: 2560, height: 1392 };
const LAPTOP = { width: 1093, height: 590 };

describe("normalizeUiScale", () => {
  it("snaps to the nearest supported step", () => {
    expect(normalizeUiScale(1)).toBe(1);
    expect(normalizeUiScale(1.27)).toBe(1.25);
    expect(normalizeUiScale(3)).toBe(1.5);
    expect(normalizeUiScale(0.1)).toBe(0.8);
  });

  it("falls back to 100% for garbage", () => {
    expect(normalizeUiScale(undefined)).toBe(1);
    expect(normalizeUiScale("big")).toBe(1);
    expect(normalizeUiScale(-2)).toBe(1);
    expect(normalizeUiScale(Number.NaN)).toBe(1);
  });
});

describe("scaledSize", () => {
  it("grows the minimum window with the scale", () => {
    expect(scaledSize(1.25, BASE)).toEqual({ width: 1600, height: 900 });
    expect(scaledSize(0.9, BASE)).toEqual({ width: 1152, height: 648 });
  });
});

describe("fitUiScale", () => {
  it("keeps a scale the screen can hold", () => {
    expect(fitUiScale(1.25, FULL_HD, BASE)).toBe(1.25);
    expect(fitUiScale(1.5, QHD, BASE)).toBe(1.5);
  });

  it("drops to the largest scale that still fits", () => {
    expect(fitUiScale(1.5, FULL_HD, BASE)).toBe(1.25);
    expect(fitUiScale(1, LAPTOP, BASE)).toBe(0.8);
  });

  it("never goes below the smallest step", () => {
    expect(fitUiScale(1, { width: 640, height: 480 }, BASE)).toBe(0.8);
  });
});

describe("uiScaleOptions", () => {
  it("marks steps that do not fit the screen", () => {
    const options = uiScaleOptions(FULL_HD, BASE);
    expect(options.filter((o) => !o.fits).map((o) => o.value)).toEqual([1.5]);
  });

  it("always leaves the smallest step available", () => {
    const options = uiScaleOptions({ width: 640, height: 480 }, BASE);
    expect(options.filter((o) => o.fits).map((o) => o.value)).toEqual([0.8]);
  });
});

describe("stepUiScale", () => {
  const options = uiScaleOptions(FULL_HD, BASE);

  it("moves one step at a time", () => {
    expect(stepUiScale(1, 1, options)).toBe(1.1);
    expect(stepUiScale(1.1, 1, options)).toBe(1.25);
    expect(stepUiScale(1, -1, options)).toBe(0.9);
  });

  it("stops at the largest step that fits", () => {
    expect(stepUiScale(1.25, 1, options)).toBe(1.25);
  });

  it("stops at the smallest step", () => {
    expect(stepUiScale(0.8, -1, options)).toBe(0.8);
  });

  it("recovers from a saved scale the screen cannot show", () => {
    expect(stepUiScale(1.5, -1, options)).toBe(1.25);
    expect(stepUiScale(1.5, 1, options)).toBe(1.25);
  });
});

describe("formatUiScale", () => {
  it("prints whole percents", () => {
    expect(formatUiScale(1.25)).toBe("125%");
    expect(formatUiScale(0.9)).toBe("90%");
  });
});
