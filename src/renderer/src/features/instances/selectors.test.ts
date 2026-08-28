import { describe, expect, it } from "vitest";
import {
  InstanceLike,
  activityTime,
  allTags,
  availableLoaders,
  instanceKey,
  nextGroupId,
  reorderKeys,
  timeValue,
} from "./selectors";

function make(
  name: string,
  options: {
    loader?: string;
    path?: string;
    lastLaunch?: string;
    lastUpdate?: string;
  } = {},
): InstanceLike {
  return {
    versionPath: options.path,
    version: {
      name,
      loader: { name: options.loader ?? "forge" },
      lastLaunch: options.lastLaunch,
      lastUpdate: options.lastUpdate,
    },
  };
}

describe("instance keys and time", () => {
  it("prefers the path over the name as a key", () => {
    expect(instanceKey(make("Better MC", { path: "/versions/better" }))).toBe(
      "/versions/better",
    );
    expect(instanceKey(make("Better MC"))).toBe("Better MC");
  });

  it("treats missing or broken dates as zero", () => {
    expect(timeValue(undefined)).toBe(0);
    expect(timeValue("not a date")).toBe(0);
    expect(timeValue("2026-08-15T00:00:00.000Z")).toBeGreaterThan(0);
  });

  it("takes the latest of launch and update as activity", () => {
    const instance = make("A", {
      lastLaunch: "2026-08-01T00:00:00.000Z",
      lastUpdate: "2026-08-10T00:00:00.000Z",
    });

    expect(activityTime(instance)).toBe(
      new Date("2026-08-10T00:00:00.000Z").getTime(),
    );
  });
});

describe("reorderKeys", () => {
  it("moves a key to the target position", () => {
    expect(reorderKeys(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(reorderKeys(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });

  it("returns null when nothing can move", () => {
    expect(reorderKeys(["a", "b"], "a", "a")).toBeNull();
    expect(reorderKeys(["a", "b"], "z", "a")).toBeNull();
    expect(reorderKeys(["a", "b"], "a", "z")).toBeNull();
  });
});

describe("facets", () => {
  it("lists unique sorted loaders", () => {
    expect(
      availableLoaders([
        make("a", { loader: "fabric" }),
        make("b", { loader: "forge" }),
        make("c", { loader: "fabric" }),
      ]),
    ).toEqual(["fabric", "forge"]);
  });

  it("lists unique sorted tags", () => {
    expect(allTags({ a: ["pvp", "co-op"], b: ["pvp"] })).toEqual([
      "co-op",
      "pvp",
    ]);
    expect(allTags({})).toEqual([]);
  });

  it("ignores tags of keys that no longer exist", () => {
    expect(allTags({ a: ["pvp"], gone: ["ancient"] }, ["a"])).toEqual(["pvp"]);
    expect(allTags({ a: ["pvp"], gone: ["ancient"] }, [])).toEqual([]);
  });

  it("keeps one spelling when the same tag differs only by case", () => {
    expect(allTags({ a: ["покемоны"], b: ["Покемоны"] })).toEqual([
      "покемоны",
    ]);
    expect(allTags({ a: ["Покемоны"], b: ["покемоны"] })).toEqual([
      "Покемоны",
    ]);
  });
});

describe("nextGroupId", () => {
  it("never reuses an id that is still taken", () => {
    expect(nextGroupId([])).toBe("g_1");
    expect(nextGroupId(["g_1"])).toBe("g_2");
    expect(nextGroupId(["g_2"])).toBe("g_3");
    expect(nextGroupId(["g_2", "g_3"])).toBe("g_4");
  });
});
