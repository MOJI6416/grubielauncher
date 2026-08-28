import { describe, expect, it } from "vitest";
import {
  parseHiddenSponsoredAdIds,
  removeHiddenSponsoredAdId,
  serializeHiddenSponsoredAdIds,
} from "./newsFeed";

describe("hidden sponsored ads", () => {
  it("parses and serializes hidden sponsored ad ids safely", () => {
    expect(parseHiddenSponsoredAdIds('["a","b",1]')).toEqual(["a", "b"]);
    expect(parseHiddenSponsoredAdIds("bad json")).toEqual([]);
    expect(parseHiddenSponsoredAdIds(null)).toEqual([]);
    expect(serializeHiddenSponsoredAdIds(["a", "a", "b"])).toBe('["a","b"]');
  });

  it("removes a hidden sponsored ad id without changing the rest", () => {
    expect(removeHiddenSponsoredAdId(["a", "b", "a"], "a")).toEqual(["b"]);
  });
});
