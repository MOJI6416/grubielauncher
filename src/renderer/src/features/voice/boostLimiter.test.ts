import { describe, expect, it } from "vitest";
import { softClipCurve } from "./boostLimiter";

function shape(curve: Float32Array, x: number): number {
  const position = ((x + 1) / 2) * (curve.length - 1);
  return curve[Math.round(position)];
}

describe("softClipCurve", () => {
  const curve = softClipCurve(0.9, 4001);

  it("passes the signal through untouched below the knee", () => {
    for (const x of [-0.9, -0.5, -0.1, 0, 0.25, 0.6, 0.9]) {
      expect(shape(curve, x)).toBeCloseTo(x, 3);
    }
  });

  it("never reaches full scale", () => {
    for (const value of curve) {
      expect(Math.abs(value)).toBeLessThan(1);
    }
  });

  it("stays monotonic and symmetric", () => {
    for (let index = 1; index < curve.length; index++) {
      expect(curve[index]).toBeGreaterThanOrEqual(curve[index - 1]);
    }
    expect(shape(curve, -0.97)).toBeCloseTo(-shape(curve, 0.97), 6);
  });
});
