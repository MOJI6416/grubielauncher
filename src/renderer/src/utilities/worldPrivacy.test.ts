import { describe, expect, it } from "vitest";
import {
  hasPublishedWorld,
  isPrivateWorldPath,
  isWorldsPath,
  splitWorldPaths,
} from "@/shared/worldPrivacy";

describe("hasPublishedWorld", () => {
  it("reads the marker a launcher writes next to the archive", () => {
    expect(
      hasPublishedWorld({ paths: ["config"], url: "u", size: 1, world: true }),
    ).toBe(true);
    expect(
      hasPublishedWorld({ paths: ["config"], url: "u", size: 1 }),
    ).toBe(false);
    expect(hasPublishedWorld(undefined)).toBe(false);
    expect(hasPublishedWorld(null)).toBe(false);
  });

  it("still recognises a world picked by hand before the tick existed", () => {
    expect(hasPublishedWorld({ paths: ["config", "saves"] })).toBe(true);
    expect(hasPublishedWorld({ paths: ["saves/My World"] })).toBe(true);
  });

  it("does not mistake a lookalike folder for a world", () => {
    expect(hasPublishedWorld({ paths: ["config/saves"] })).toBe(false);
    expect(hasPublishedWorld({ paths: ["savesx"] })).toBe(false);
  });
});

describe("splitWorldPaths", () => {
  it("keeps worlds out of the picked-files list", () => {
    expect(splitWorldPaths(["config", "saves", "kubejs"])).toEqual({
      worldPaths: ["saves"],
      otherPaths: ["config", "kubejs"],
    });
  });
});

describe("world path predicates", () => {
  it("names what leaves the player behind", () => {
    expect(isWorldsPath("saves/My World/region")).toBe(true);
    expect(isWorldsPath("config")).toBe(false);

    expect(isPrivateWorldPath("saves/My World/playerdata/a.dat")).toBe(true);
    expect(isPrivateWorldPath("saves/My World/stats/a.json")).toBe(true);
    expect(isPrivateWorldPath("saves/My World/advancements/a.json")).toBe(true);
    expect(isPrivateWorldPath("saves/My World/session.lock")).toBe(true);

    expect(isPrivateWorldPath("saves/My World/level.dat")).toBe(false);
    expect(isPrivateWorldPath("saves/My World/region/r.0.0.mca")).toBe(false);
    expect(isPrivateWorldPath("saves/My World/DIM1/region/r.0.0.mca")).toBe(
      false,
    );
  });
});
