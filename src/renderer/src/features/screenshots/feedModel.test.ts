import { describe, expect, it } from "vitest";
import {
  buildFeed,
  feedInstances,
  filterFeed,
  shotTime,
  sortFeed,
} from "./feedModel";

const join = (folder: string, name: string) => `${folder}/${name}`;

const feed = buildFeed(
  [
    {
      instance: { key: "a", name: "Vanilla", folder: "/v/a/screenshots" },
      names: [
        "2026-11-20_14.03.22.png",
        "2026-11-18_09.00.00.png",
        "notes.txt",
      ],
    },
    {
      instance: { key: "b", name: "Create Above", folder: "/v/b/screenshots" },
      names: ["2026-11-19_21.15.40_2.png", "my shot.jpg"],
    },
  ],
  join,
);

describe("screenshot feed", () => {
  it("collects pictures from every instance and skips other files", () => {
    expect(feed.map((shot) => shot.path)).toEqual([
      "/v/a/screenshots/2026-11-20_14.03.22.png",
      "/v/a/screenshots/2026-11-18_09.00.00.png",
      "/v/b/screenshots/2026-11-19_21.15.40_2.png",
      "/v/b/screenshots/my shot.jpg",
    ]);
  });

  it("reads the time Minecraft writes into the file name", () => {
    expect(shotTime("2026-11-19_21.15.40_2.png")).toBe(
      new Date(2026, 10, 19, 21, 15, 40).getTime(),
    );
    expect(shotTime("my shot.jpg")).toBeNull();
  });

  it("sorts newest first across instances", () => {
    expect(sortFeed(feed, "newest").map((shot) => shot.name)).toEqual([
      "2026-11-20_14.03.22.png",
      "2026-11-19_21.15.40_2.png",
      "2026-11-18_09.00.00.png",
      "my shot.jpg",
    ]);
    expect(sortFeed(feed, "oldest")[0].name).toBe("my shot.jpg");
    expect(sortFeed(feed, "instance").map((shot) => shot.instanceKey)).toEqual([
      "b",
      "b",
      "a",
      "a",
    ]);
  });

  it("finds shots by instance, file name and date", () => {
    expect(filterFeed(feed, { query: "create", instanceKey: "" })).toHaveLength(2);
    expect(filterFeed(feed, { query: "20.11.2026", instanceKey: "" })).toHaveLength(1);
    expect(filterFeed(feed, { query: "vanilla 18.11", instanceKey: "" })).toHaveLength(1);
    expect(filterFeed(feed, { query: "", instanceKey: "b" })).toHaveLength(2);
    expect(filterFeed(feed, { query: "vanilla", instanceKey: "b" })).toHaveLength(0);
  });

  it("lists instances with how many shots each has", () => {
    expect(feedInstances(feed)).toEqual([
      { key: "b", name: "Create Above", count: 2 },
      { key: "a", name: "Vanilla", count: 2 },
    ]);
  });
});
