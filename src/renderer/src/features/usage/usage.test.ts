import { describe, expect, it } from "vitest";
import { USAGE_FEATURES } from "@/shared/usageFeatures";
import { SETTINGS_SECTIONS } from "@renderer/features/settings/catalog";
import type { InstanceTab, Route } from "@renderer/navigation/routes";
import { routeUsage } from "./usage";

const INSTANCE_TABS: InstanceTab[] = [
  "overview",
  "modpack",
  "content",
  "worlds",
  "servers",
  "server",
  "configs",
  "settings",
  "statistics",
  "logs",
  "bisect",
];

describe("routeUsage", () => {
  it("counts the screen and its default tab on the first visit", () => {
    expect(routeUsage(null, { name: "home" }, "overview")).toEqual([
      "screen.home",
    ]);
    expect(
      routeUsage({ name: "home" }, { name: "instance", id: "a" }, "content"),
    ).toEqual(["screen.instance", "instance.content"]);
  });

  it("counts only the tab when moving inside one screen", () => {
    const overview: Route = { name: "instance", id: "a", tab: "overview" };
    const worlds: Route = { name: "instance", id: "a", tab: "worlds" };

    expect(routeUsage(overview, worlds, "overview")).toEqual([
      "instance.worlds",
    ]);
    expect(routeUsage(worlds, worlds, "overview")).toEqual([]);
  });

  it("counts a different instance as a new visit", () => {
    expect(
      routeUsage(
        { name: "instance", id: "a", tab: "worlds" },
        { name: "instance", id: "b", tab: "worlds" },
        "overview",
      ),
    ).toEqual(["screen.instance", "instance.worlds"]);
  });

  it("never names an instance, a person or a chat", () => {
    const features = [
      ...routeUsage(null, { name: "profile", userId: "u1", tab: "leaderboard" }, "overview"),
      ...routeUsage(null, { name: "people", peerId: "p1" }, "overview"),
      ...routeUsage(null, { name: "agent", chatId: "c1" }, "overview"),
    ];

    expect(features).toEqual([
      "screen.profile",
      "profile.leaderboard",
      "screen.people",
      "people.friends",
      "screen.agent",
    ]);
  });

  it("counts the catalog outside an instance apart from the content tab", () => {
    expect(routeUsage({ name: "home" }, { name: "catalog" }, "content")).toEqual([
      "screen.catalog",
    ]);
  });

  it("knows every instance tab and settings section", () => {
    const known = new Set<string>(USAGE_FEATURES);
    for (const tab of INSTANCE_TABS) expect(known.has(`instance.${tab}`)).toBe(true);
    for (const section of SETTINGS_SECTIONS)
      expect(known.has(`settings.${section}`)).toBe(true);
  });
});
