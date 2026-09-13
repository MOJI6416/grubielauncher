import { describe, expect, it } from "vitest";
import { progressPercent } from "./archiveProgress";

describe("progressPercent", () => {
  it("rounds and clamps to a whole percent", () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(5, 4)).toBe(100);
    expect(progressPercent(-1, 4)).toBe(0);
  });

  it("reports zero while the total is still unknown", () => {
    expect(progressPercent(10, 0)).toBe(0);
    expect(progressPercent(10, Number.NaN)).toBe(0);
  });
});
