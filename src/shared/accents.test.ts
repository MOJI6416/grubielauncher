import { describe, expect, it } from "vitest";
import {
  ACCENT_IDS,
  ACCENTS,
  accentVariables,
  contrastRatio,
  isAccentId,
} from "./accents";

const SURFACE = "#26272b";

describe("accent palette", () => {
  it("keeps every button label readable on its accent", () => {
    for (const id of ACCENT_IDS) {
      const { primary, foreground } = ACCENTS[id];
      expect(contrastRatio(primary, foreground), id).toBeGreaterThanOrEqual(4.2);
    }
  });

  it("keeps every accent visible as text and outline on the dark surfaces", () => {
    for (const id of ACCENT_IDS) {
      expect(contrastRatio(ACCENTS[id].primary, SURFACE), id).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("drives the ring and the first chart colour from the accent", () => {
    expect(accentVariables("cyan")).toEqual({
      "--primary": "#22b8cf",
      "--ring": "#22b8cf",
      "--primary-foreground": "#111316",
      "--chart-1": "#22b8cf",
    });
  });

  it("recognises only the shipped accents", () => {
    expect(isAccentId("violet")).toBe(true);
    expect(isAccentId("orange")).toBe(false);
    expect(isAccentId(undefined)).toBe(false);
  });
});
