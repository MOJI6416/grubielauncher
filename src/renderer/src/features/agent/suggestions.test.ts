import { describe, expect, it } from "vitest";
import { MAX_SUGGESTIONS, pickSuggestions } from "./suggestions";

describe("pickSuggestions", () => {
  it("falls back to the general prompts when nothing is going on", () => {
    expect(
      pickSuggestions({
        crashed: null,
        updatable: null,
        selected: null,
        instanceCount: 3,
      }).map((entry) => entry.id),
    ).toEqual(["crash", "optimize", "cleanup", "compare"]);
  });

  it("puts a fresh crash first and names the instance", () => {
    const picked = pickSuggestions({
      crashed: "Create",
      updatable: null,
      selected: "Create",
      instanceCount: 2,
    });

    expect(picked[0]).toEqual({ id: "crashNamed", name: "Create" });
    expect(picked.map((entry) => entry.id)).toEqual([
      "crashNamed",
      "optimizeNamed",
      "cleanup",
      "compare",
    ]);
  });

  it("offers a pending modpack update and never more than the cap", () => {
    const picked = pickSuggestions({
      crashed: "A",
      updatable: "B",
      selected: "C",
      instanceCount: 5,
    });

    expect(picked).toHaveLength(MAX_SUGGESTIONS);
    expect(picked[1]).toEqual({ id: "updateNamed", name: "B" });
  });

  it("does not offer to compare a single instance", () => {
    const ids = pickSuggestions({
      crashed: null,
      updatable: null,
      selected: "Only",
      instanceCount: 1,
    }).map((entry) => entry.id);

    expect(ids).not.toContain("compare");
  });
});
