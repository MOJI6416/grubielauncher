import { describe, expect, it } from "vitest";
import { canAddTag, filterSuggestions, normalizeTag } from "./tags";

describe("normalizeTag", () => {
  it("lowercases, drops punctuation and collapses spaces", () => {
    expect(normalizeTag("  Soft   Pastel!!  ")).toBe("soft pastel");
  });

  it("keeps digits and hyphens", () => {
    expect(normalizeTag("Y2K-core 90")).toBe("y2k-core 90");
  });

  it("drops non-latin letters instead of keeping them", () => {
    expect(normalizeTag("нежный soft")).toBe("soft");
  });

  it("cuts to 24 characters", () => {
    expect(normalizeTag("a".repeat(40))).toHaveLength(24);
  });

  it("returns an empty string when nothing survives", () => {
    expect(normalizeTag("!!! ???")).toBe("");
  });
});

describe("canAddTag", () => {
  it("refuses an empty tag", () => {
    expect(canAddTag("  ", [], 8)).toBe(false);
  });

  it("refuses a reserved tag", () => {
    expect(canAddTag("Official", [], 8)).toBe(false);
  });

  it("refuses a duplicate after normalization", () => {
    expect(canAddTag("  SOFT ", ["soft"], 8)).toBe(false);
  });

  it("refuses once the limit is reached", () => {
    expect(canAddTag("new", ["a", "b"], 2)).toBe(false);
  });

  it("accepts a fresh tag below the limit", () => {
    expect(canAddTag("Soft", ["cute"], 8)).toBe(true);
  });
});

describe("filterSuggestions", () => {
  it("hides already selected and reserved tags and honours the limit", () => {
    expect(
      filterSuggestions(["soft", "official", "cute", "y2k"], ["soft"], 2),
    ).toEqual(["cute", "y2k"]);
  });
});
