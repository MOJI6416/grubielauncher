import { describe, expect, it } from "vitest";
import type { IPublicProfile } from "@/types/Profile";
import { isSameProfile, profileModpacks, profileRank } from "./publicProfile";

function profile(overrides: Partial<IPublicProfile> = {}): IPublicProfile {
  return {
    generatedAt: "",
    id: "aaa",
    nickname: "Player",
    headUrl: "",
    image: "",
    isDonor: false,
    donorSince: null,
    createdAt: null,
    playTimeHours: 0,
    points: 0,
    level: 1,
    achievements: [],
    rank: 7,
    socials: {},
    modpacks: [],
    skins: [],
    ...overrides,
  };
}

describe("isSameProfile", () => {
  it("matches only the account the profile screen is showing", () => {
    expect(isSameProfile(profile(), "aaa")).toBe(true);
    expect(isSameProfile(profile(), "bbb")).toBe(false);
  });

  it("refuses to match on missing data", () => {
    expect(isSameProfile(null, "aaa")).toBe(false);
    expect(isSameProfile(profile(), undefined)).toBe(false);
  });
});

describe("profileModpacks", () => {
  const card = { id: "pack-1" } as IPublicProfile["modpacks"][number];

  it("returns the packs of the matching account", () => {
    expect(profileModpacks(profile({ modpacks: [card] }), "aaa")).toEqual([
      card,
    ]);
  });

  it("returns nothing when the nickname resolved to another account", () => {
    expect(profileModpacks(profile({ modpacks: [card] }), "bbb")).toEqual([]);
  });

  it("survives a broken payload", () => {
    expect(
      profileModpacks(profile({ modpacks: undefined as unknown as [] }), "aaa"),
    ).toEqual([]);
  });
});

describe("profileRank", () => {
  it("reads the rank of the matching account", () => {
    expect(profileRank(profile(), "aaa")).toBe(7);
  });

  it("is null when the player is not ranked or is another account", () => {
    expect(profileRank(profile({ rank: null }), "aaa")).toBeNull();
    expect(profileRank(profile(), "bbb")).toBeNull();
  });
});
