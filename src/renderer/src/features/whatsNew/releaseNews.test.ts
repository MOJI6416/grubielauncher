import { describe, expect, it } from "vitest";
import type { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { newsSource } from "@renderer/features/news/feed";
import {
  releaseNewsId,
  releaseNewsUrl,
  releaseToNewsItem,
  releasesById,
  releasesToNewsItems,
} from "./releaseNews";

const note = (patch: Partial<ILauncherReleaseNote> = {}) =>
  ({
    version: "1.9.3",
    title: "Grubie Launcher 1.9.3",
    subtitle: "Staying connected",
    highlights: ["a"],
    fixes: ["b"],
    discordCta: "",
    discordUrl: "",
    isMilestone: false,
    publishedAt: "2026-08-09T20:27:56.998Z",
    ...patch,
  }) satisfies ILauncherReleaseNote;

describe("releaseToNewsItem", () => {
  it("lands in the feed under our own source", () => {
    const item = releaseToNewsItem(note(), "ru");

    expect(item).not.toBeNull();
    expect(newsSource(item!.url)).toBe("grubie");
    expect(item!.id).toBe(releaseNewsId("1.9.3"));
    expect(item!.description).toBe("Staying connected");
  });

  it("carries the publish date the feed sorts on", () => {
    const item = releaseToNewsItem(note(), "en");

    expect(item!.time).toBe(
      Math.floor(new Date("2026-08-09T20:27:56.998Z").getTime() / 1000),
    );
  });

  it("survives a release without a date", () => {
    expect(releaseToNewsItem(note({ publishedAt: null }), "en")!.time).toBe(0);
  });

  it("drops a release without a version", () => {
    expect(releaseToNewsItem(note({ version: " " }), "en")).toBeNull();
    expect(releaseToNewsItem(null, "en")).toBeNull();
  });

  it("links to the changelog of the current language", () => {
    expect(releaseNewsUrl("1.9.3", "uk-UA")).toContain("/uk/changelog");
  });
});

describe("releasesToNewsItems", () => {
  it("skips holes without losing the rest", () => {
    const items = releasesToNewsItems(
      [note(), null, note({ version: "1.9.2" })],
      "en",
    );

    expect(items.map((item) => item.id)).toEqual([
      releaseNewsId("1.9.3"),
      releaseNewsId("1.9.2"),
    ]);
  });
});

describe("releasesById", () => {
  it("indexes releases by the id the feed item carries", () => {
    const index = releasesById([note(), note({ version: "1.9.2" })]);

    expect(index.get(releaseNewsId("1.9.2"))?.version).toBe("1.9.2");
    expect(index.get("grubie-release:0.0.1")).toBeUndefined();
  });
});
