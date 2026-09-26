import { describe, expect, it } from "vitest";
import {
  DETAIL_WIDTH_DEFAULT,
  DETAIL_WIDTH_MAX,
  DETAIL_WIDTH_MIN,
  clampDetailWidth,
  maxDetailWidth,
} from "./detailWidth";

describe("clampDetailWidth", () => {
  it("keeps the panel between its bounds", () => {
    expect(clampDetailWidth(100, 1600)).toBe(DETAIL_WIDTH_MIN);
    expect(clampDetailWidth(2000, 1600)).toBe(DETAIL_WIDTH_MAX);
    expect(clampDetailWidth(420.4, 1600)).toBe(420);
  });

  it("leaves the list room to breathe in a narrow window", () => {
    expect(maxDetailWidth(1000)).toBe(480);
    expect(clampDetailWidth(600, 1000)).toBe(480);
  });

  it("never lets the maximum fall below the minimum", () => {
    expect(maxDetailWidth(600)).toBe(DETAIL_WIDTH_MIN);
  });

  it("falls back to the default for a broken stored value", () => {
    expect(clampDetailWidth(Number.NaN, 1600)).toBe(DETAIL_WIDTH_DEFAULT);
  });
});
