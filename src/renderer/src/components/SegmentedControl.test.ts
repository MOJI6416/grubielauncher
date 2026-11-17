import { describe, expect, it } from "vitest";
import { segmentKeyTarget } from "./SegmentedControl";

describe("segmentKeyTarget", () => {
  const all = [true, true, true];

  it("moves to the neighbour and wraps around", () => {
    expect(segmentKeyTarget("ArrowRight", 0, all)).toBe(1);
    expect(segmentKeyTarget("ArrowRight", 2, all)).toBe(0);
    expect(segmentKeyTarget("ArrowLeft", 0, all)).toBe(2);
    expect(segmentKeyTarget("ArrowUp", 1, all)).toBe(0);
  });

  it("skips disabled options", () => {
    expect(segmentKeyTarget("ArrowRight", 0, [true, false, true])).toBe(2);
    expect(segmentKeyTarget("Home", 2, [false, true, true])).toBe(1);
    expect(segmentKeyTarget("End", 0, [true, true, false])).toBe(1);
  });

  it("ignores other keys and a lone option", () => {
    expect(segmentKeyTarget("Enter", 0, all)).toBeNull();
    expect(segmentKeyTarget("ArrowRight", 0, [true])).toBeNull();
  });

  it("starts from an edge when nothing is selected", () => {
    expect(segmentKeyTarget("ArrowRight", -1, all)).toBe(0);
    expect(segmentKeyTarget("ArrowLeft", -1, all)).toBe(2);
  });
});
