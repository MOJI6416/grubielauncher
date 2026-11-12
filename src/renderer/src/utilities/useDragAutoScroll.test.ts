import { describe, expect, it } from "vitest";
import {
  DRAG_SCROLL_EDGE,
  DRAG_SCROLL_MAX_SPEED,
  edgeScrollSpeed,
} from "./useDragAutoScroll";

describe("edgeScrollSpeed", () => {
  it("stays still in the middle and outside the list", () => {
    expect(edgeScrollSpeed(300, 0, 600)).toBe(0);
    expect(edgeScrollSpeed(-5, 0, 600)).toBe(0);
    expect(edgeScrollSpeed(605, 0, 600)).toBe(0);
  });

  it("scrolls up near the top and down near the bottom, faster at the edge", () => {
    expect(edgeScrollSpeed(0, 0, 600)).toBeCloseTo(-DRAG_SCROLL_MAX_SPEED);
    expect(edgeScrollSpeed(600, 0, 600)).toBeCloseTo(DRAG_SCROLL_MAX_SPEED);

    const near = edgeScrollSpeed(590, 0, 600);
    const far = edgeScrollSpeed(600 - DRAG_SCROLL_EDGE + 5, 0, 600);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("shrinks the edge zone for short lists so the middle stays usable", () => {
    expect(edgeScrollSpeed(50, 0, 120)).toBe(0);
    expect(edgeScrollSpeed(10, 0, 120)).toBeLessThan(0);
  });
});
