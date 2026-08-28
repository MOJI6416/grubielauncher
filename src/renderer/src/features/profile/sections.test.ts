import { describe, expect, it } from "vitest";
import { parseProfileSection, resolveProfileSection } from "./sections";
import { isSameRoute, routeKey } from "@renderer/navigation/routes";

describe("parseProfileSection", () => {
  it("accepts the known sections", () => {
    expect(parseProfileSection("skins")).toBe("skins");
    expect(parseProfileSection("achievements")).toBe("achievements");
    expect(parseProfileSection("leaderboard")).toBe("leaderboard");
    expect(parseProfileSection("modpacks")).toBe("modpacks");
  });

  it("treats the base profile tab and junk as no section", () => {
    expect(parseProfileSection("profile")).toBeNull();
    expect(parseProfileSection(undefined)).toBeNull();
    expect(parseProfileSection("../etc")).toBeNull();
  });
});

describe("resolveProfileSection", () => {
  it("leaves a stranger's profile on the overview", () => {
    expect(resolveProfileSection(null, false)).toBeNull();
    expect(resolveProfileSection("achievements", false)).toBeNull();
  });

  it("never opens an owner-only section on a stranger's profile", () => {
    expect(resolveProfileSection("skins", false)).toBeNull();
    expect(resolveProfileSection("leaderboard", false)).toBeNull();
  });

  it("opens the published packs of a stranger", () => {
    expect(resolveProfileSection("modpacks", false)).toBe("modpacks");
  });

  it("keeps every section for the owner", () => {
    expect(resolveProfileSection("achievements", true)).toBe("achievements");
    expect(resolveProfileSection("skins", true)).toBe("skins");
    expect(resolveProfileSection("modpacks", true)).toBe("modpacks");
    expect(resolveProfileSection("leaderboard", true)).toBe("leaderboard");
  });
});

describe("profile route identity", () => {
  it("separates sections so navigating between them pushes history", () => {
    const base = { name: "profile", userId: "me" } as const;
    const skins = { name: "profile", userId: "me", tab: "skins" } as const;

    expect(routeKey(base)).not.toBe(routeKey(skins));
    expect(isSameRoute(base, skins)).toBe(false);
    expect(isSameRoute(skins, { ...skins })).toBe(true);
  });

  it("keeps different users apart", () => {
    expect(
      isSameRoute(
        { name: "profile", userId: "a", tab: "skins" },
        { name: "profile", userId: "b", tab: "skins" },
      ),
    ).toBe(false);
  });
});
