import { describe, expect, it } from "vitest";
import { normalizeRecents, pushRecent } from "./expressionRecents";

describe("expression recents", () => {
  it("moves a reused item to the front without duplicating it", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(pushRecent([], "x")).toEqual(["x"]);
  });

  it("keeps at most sixteen items", () => {
    const list = Array.from({ length: 16 }, (_, index) => String(index));
    const next = pushRecent(list, "new");
    expect(next).toHaveLength(16);
    expect(next[0]).toBe("new");
    expect(next).not.toContain("15");
  });

  it("drops anything that is not a short string list", () => {
    expect(normalizeRecents(null)).toEqual({ emoji: [], stickers: [] });
    expect(
      normalizeRecents({ emoji: ["😀", 5, "x".repeat(100)], stickers: "noto/1f602" }),
    ).toEqual({ emoji: ["😀"], stickers: [] });
  });
});
