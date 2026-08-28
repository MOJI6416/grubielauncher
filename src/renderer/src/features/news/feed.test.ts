import { describe, expect, it } from "vitest";
import type { INews } from "@/types/News";
import {
  availableSources,
  buildNewsCards,
  capSource,
  filterBySource,
  mergeNewsItems,
  mixFeed,
  newestTime,
  newsKind,
  readNewsPage,
  newsSource,
  newsSummary,
  newsVersion,
  parseLastSeen,
  resolveFeedOutcome,
  splitFeed,
  unreadCount,
} from "./feed";

function item(overrides: Partial<INews> = {}): INews {
  return {
    title: "A story",
    url: "https://www.minecraft.net/en-us/article/a-story",
    author: "Staff",
    image: "https://example.com/a.png",
    imageAltText: "",
    time: 1_700_000_000,
    tags: ["article-page"],
    ...overrides,
  };
}

describe("news feed model", () => {
  it("recognises the source behind a link", () => {
    expect(newsSource("https://www.minecraft.net/en-us/article/x")).toBe(
      "minecraft",
    );
    expect(newsSource("https://grubielauncher.com/ru/changelog")).toBe(
      "grubie",
    );
    expect(newsSource("https://example.com/x")).toBe("other");
    expect(newsSource("not a url")).toBe("other");
  });

  it("labels snapshots, pre-releases and releases apart", () => {
    expect(newsKind(item({ title: "Minecraft 26.1 Snapshot 8" }))).toBe(
      "snapshot",
    );
    expect(newsKind(item({ title: "Minecraft 1.21.4 Pre-Release 2" }))).toBe(
      "prerelease",
    );
    expect(
      newsKind(item({ title: "Minecraft 1.21.4 Release Candidate 1" })),
    ).toBe("candidate");
    expect(newsKind(item({ title: "Minecraft 1.21.4 is out" }))).toBe("release");
    expect(
      newsKind(item({ title: "Mob Menagerie: Phantom", tags: ["minecraft:stockholm/deep-dives"] })),
    ).toBe("deepDive");
    expect(newsKind(item({ title: "Taking Inventory: Lapis" }))).toBe("article");
  });

  it("pulls the game version out of a title", () => {
    expect(newsVersion("Minecraft 26.1 Snapshot 8")).toBe("26.1");
    expect(newsVersion("Minecraft Snapshot 24W14A")).toBe("24w14a");
    expect(newsVersion("The final baby mobs are here")).toBe("");
  });

  it("drops a description that only repeats the title", () => {
    expect(
      newsSummary(item({ title: "Snapshot 8", description: "Snapshot 8" })),
    ).toBe("");
    expect(
      newsSummary(item({ title: "Snapshot 8", description: "Pandas!" })),
    ).toBe("Pandas!");
    expect(newsSummary(item({ description: undefined }))).toBe("");
  });

  it("sorts newest first and skips malformed entries", () => {
    const cards = buildNewsCards([
      item({ title: "old", time: 100 }),
      { ...item({ title: "broken" }), url: "" },
      item({ title: "new", time: 200 }),
    ]);

    expect(cards.map((card) => card.item.title)).toEqual(["new", "old"]);
    expect(cards[0].time).toBe(200_000);
  });

  it("lists only the sources actually present, brand first", () => {
    const cards = buildNewsCards([
      item(),
      item({ url: "https://grubielauncher.com/news/1" }),
    ]);

    expect(availableSources(cards)).toEqual(["grubie", "minecraft"]);
    expect(filterBySource(cards, "grubie")).toHaveLength(1);
    expect(filterBySource(cards, "all")).toHaveLength(2);
  });

  it("keeps our own releases from taking over the mixed feed", () => {
    const ours = (version: string, time: number) =>
      item({
        title: `Grubie Launcher ${version}`,
        url: `https://grubielauncher.com/ru/changelog#v${version}`,
        time,
      });

    const cards = buildNewsCards([
      ours("1.9.3", 900),
      ours("1.9.2", 800),
      ours("1.9.1", 700),
      ours("1.9.0", 600),
      item({ title: "mojang", time: 500 }),
    ]);

    const capped = capSource(cards, "grubie", 3);

    expect(capped.map((card) => card.item.title)).toEqual([
      "Grubie Launcher 1.9.3",
      "Grubie Launcher 1.9.2",
      "Grubie Launcher 1.9.1",
      "mojang",
    ]);
    expect(capSource(cards, "grubie", 0)).toHaveLength(1);
    expect(filterBySource(cards, "grubie")).toHaveLength(4);
    expect(mixFeed(cards, "grubie", 3)).toEqual(capped);
  });

  it("drops the cap when our releases are the only feed left", () => {
    const ours = (version: string, time: number) =>
      item({
        title: `Grubie Launcher ${version}`,
        url: `https://grubielauncher.com/ru/changelog#v${version}`,
        time,
      });

    const cards = buildNewsCards([
      ours("1.9.3", 900),
      ours("1.9.2", 800),
      ours("1.9.1", 700),
      ours("1.9.0", 600),
    ]);

    expect(capSource(cards, "grubie", 3)).toHaveLength(3);
    expect(mixFeed(cards, "grubie", 3)).toHaveLength(4);
    expect(mixFeed([], "grubie", 3)).toEqual([]);
  });

  it("counts unread against the last visit only when one is known", () => {
    const cards = buildNewsCards([
      item({ title: "a", time: 100 }),
      item({ title: "b", time: 300 }),
    ]);

    expect(unreadCount(cards, 0)).toBe(0);
    expect(unreadCount(cards, 200_000)).toBe(1);
    expect(newestTime(cards)).toBe(300_000);
  });

  it("splits the feed into hero, secondary and the rest", () => {
    const cards = buildNewsCards(
      Array.from({ length: 9 }, (_, index) =>
        item({ title: `n${index}`, time: 1000 - index }),
      ),
    );

    const split = splitFeed(cards);
    expect(split.hero?.item.title).toBe("n0");
    expect(split.secondary.map((card) => card.item.title)).toEqual([
      "n1",
      "n2",
      "n3",
    ]);
    expect(split.rest).toHaveLength(5);

    expect(splitFeed([])).toEqual({ hero: null, secondary: [], rest: [] });
  });

  it("reads a stored last-visit stamp defensively", () => {
    expect(parseLastSeen("1700")).toBe(1700);
    expect(parseLastSeen("nope")).toBe(0);
    expect(parseLastSeen(null)).toBe(0);
    expect(parseLastSeen("-5")).toBe(0);
  });
});

describe("news paging", () => {
  it("appends the next page and keeps the reading order", () => {
    const merged = mergeNewsItems(
      [item({ id: "1", title: "n1" }), item({ id: "2", title: "n2" })],
      [item({ id: "3", title: "n3" })],
    );

    expect(merged.map((entry) => entry.title)).toEqual(["n1", "n2", "n3"]);
  });

  it("never shows the same article twice across a page boundary", () => {
    const merged = mergeNewsItems(
      [item({ id: "1", title: "n1" })],
      [item({ id: "1", title: "n1 again" }), item({ id: "2", title: "n2" })],
    );

    expect(merged.map((entry) => entry.title)).toEqual(["n1", "n2"]);
  });

  it("falls back to the url when the archive sent no id", () => {
    const merged = mergeNewsItems(
      [item({ url: "https://example.com/a" })],
      [item({ url: "https://example.com/a" }), item({ url: "https://example.com/b" })],
    );

    expect(merged).toHaveLength(2);
  });

  it("drops holes that would render as an empty card", () => {
    const merged = mergeNewsItems(
      [],
      [
        item({ id: "1" }),
        { ...item({ id: "2" }), url: "" },
        null as unknown as INews,
      ],
    );

    expect(merged).toHaveLength(1);
  });

  it("hands the server cursor back untouched", () => {
    expect(
      readNewsPage({
        generatedAt: "now",
        items: [item({ id: "1" })],
        nextCursor: "1700000000000_abc",
      }),
    ).toEqual({ items: [item({ id: "1" })], nextCursor: "1700000000000_abc" });
  });

  it("treats a null cursor as the end of the archive", () => {
    expect(
      readNewsPage({
        generatedAt: "now",
        items: [item({ id: "1" })],
        nextCursor: null,
      }).nextCursor,
    ).toBeNull();
  });

  it("stops paging when a page came back empty or missing", () => {
    expect(
      readNewsPage({ generatedAt: "now", items: [], nextCursor: "more" }),
    ).toEqual({ items: [], nextCursor: null });
    expect(readNewsPage(null)).toEqual({ items: [], nextCursor: null });
  });
});

describe("resolveFeedOutcome", () => {
  it("reports a total failure when nothing arrived at all", () => {
    expect(
      resolveFeedOutcome({ answered: false, itemCount: 0, releaseCount: 0 }),
    ).toEqual({ hasError: true, partialError: false });
  });

  it("still reports the dead source when only launcher releases arrived", () => {
    expect(
      resolveFeedOutcome({ answered: false, itemCount: 0, releaseCount: 5 }),
    ).toEqual({ hasError: false, partialError: true });
  });

  it("stays quiet when the source answered with an empty archive", () => {
    expect(
      resolveFeedOutcome({ answered: true, itemCount: 0, releaseCount: 5 }),
    ).toEqual({ hasError: false, partialError: false });
  });

  it("stays quiet when items came through the legacy fallback", () => {
    expect(
      resolveFeedOutcome({ answered: false, itemCount: 12, releaseCount: 0 }),
    ).toEqual({ hasError: false, partialError: false });
  });
});
