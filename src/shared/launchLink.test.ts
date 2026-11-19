import { describe, expect, it } from "vitest";
import {
  buildLaunchDeepLink,
  isSafeQuickServer,
  isSafeQuickWorld,
  readLaunchTarget,
} from "./launchLink";

describe("launch links", () => {
  it("adds the world or server to the launch link", () => {
    expect(buildLaunchDeepLink("My Pack", 0)).toBe(
      "grubielauncher://launch/My%20Pack?instance=0",
    );
    expect(buildLaunchDeepLink("My Pack", 0, { world: "Новый мир" })).toBe(
      "grubielauncher://launch/My%20Pack?instance=0&world=%D0%9D%D0%BE%D0%B2%D1%8B%D0%B9%20%D0%BC%D0%B8%D1%80",
    );
    expect(
      buildLaunchDeepLink("Pack", 1, { server: "play.example.org:25566" }),
    ).toBe(
      "grubielauncher://launch/Pack?instance=1&server=play.example.org%3A25566",
    );
  });

  it("reads back only safe targets", () => {
    const url = new URL(
      buildLaunchDeepLink("Pack", 0, { world: "Survival 2" }),
    );
    expect(readLaunchTarget(url.searchParams)).toEqual({ world: "Survival 2" });
    expect(
      readLaunchTarget(new URLSearchParams("world=..%2Fsecret")),
    ).toEqual({});
    expect(readLaunchTarget(new URLSearchParams("server=-evil"))).toEqual({});
  });

  it("refuses names that could turn into game options or paths", () => {
    expect(isSafeQuickWorld("--server")).toBe(false);
    expect(isSafeQuickWorld("a/b")).toBe(false);
    expect(isSafeQuickWorld("..")).toBe(false);
    expect(isSafeQuickWorld(" padded")).toBe(false);
    expect(isSafeQuickWorld("a\u0001b")).toBe(false);
    expect(isSafeQuickWorld("Мой мир (1)")).toBe(true);
    expect(isSafeQuickServer("mc.example.org")).toBe(true);
    expect(isSafeQuickServer("[2001:db8::1]:25565")).toBe(true);
    expect(isSafeQuickServer("evil host")).toBe(false);
  });
});
