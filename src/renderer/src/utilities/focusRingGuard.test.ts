import { describe, expect, it } from "vitest";
import { ringOverflows } from "./focusRingGuard";

const clip = { left: 0, right: 200, top: 0, bottom: 100 };
const both = { x: true, y: true };

describe("ringOverflows", () => {
  it("keeps the outer ring when there is room on every side", () => {
    expect(
      ringOverflows({ left: 4, right: 196, top: 4, bottom: 96 }, clip, 3, both),
    ).toBe(false);
  });

  it("flags an element that touches a clipping edge", () => {
    expect(
      ringOverflows(
        { left: 0, right: 150, top: 10, bottom: 40 },
        clip,
        3,
        both,
      ),
    ).toBe(true);
    expect(
      ringOverflows(
        { left: 10, right: 150, top: 0, bottom: 32 },
        clip,
        3,
        both,
      ),
    ).toBe(true);
    expect(
      ringOverflows(
        { left: 10, right: 199, top: 10, bottom: 40 },
        clip,
        3,
        both,
      ),
    ).toBe(true);
  });

  it("only checks the axes the container actually clips", () => {
    const element = { left: 0, right: 200, top: 10, bottom: 40 };
    expect(ringOverflows(element, clip, 3, { x: false, y: true })).toBe(false);
    expect(ringOverflows(element, clip, 3, { x: true, y: false })).toBe(true);
  });
});
