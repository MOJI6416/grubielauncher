import { describe, expect, it } from "vitest";
import {
  buildNewsFeedItems,
  parseHiddenSponsoredAdIds,
  removeHiddenSponsoredAdId,
  serializeHiddenSponsoredAdIds,
} from "./newsFeed";
import { INews, ISponsoredNewsAd } from "@/types/News";

function newsItem(title: string): INews {
  return {
    title,
    url: `https://example.com/${title}`,
    author: "news",
    image: "https://example.com/image.png",
    imageAltText: title,
    time: 0,
    tags: [],
  };
}

const ad: ISponsoredNewsAd = {
  id: "ad-1",
  title: "Ad",
  description: "Sponsored",
  cta: "Open",
  image: "https://example.com/ad.png",
  targetUrl: "https://example.com/ad",
};

describe("news feed utilities", () => {
  it("inserts at most one sponsored item after the second news item", () => {
    const result = buildNewsFeedItems(
      [newsItem("one"), newsItem("two"), newsItem("three")],
      ad,
    );

    expect(result.map((item) => item.type)).toEqual([
      "news",
      "news",
      "sponsored",
      "news",
    ]);
  });

  it("keeps news-only feed when sponsored ad is absent", () => {
    const result = buildNewsFeedItems([newsItem("one")], null);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("news");
  });

  it("parses and serializes hidden sponsored ad ids safely", () => {
    expect(parseHiddenSponsoredAdIds('["a","b",1]')).toEqual(["a", "b"]);
    expect(parseHiddenSponsoredAdIds("bad json")).toEqual([]);
    expect(serializeHiddenSponsoredAdIds(["a", "a", "b"])).toBe(
      '["a","b"]',
    );
  });

  it("removes a hidden sponsored ad id without changing the rest", () => {
    expect(removeHiddenSponsoredAdId(["a", "b", "a"], "a")).toEqual(["b"]);
  });
});
