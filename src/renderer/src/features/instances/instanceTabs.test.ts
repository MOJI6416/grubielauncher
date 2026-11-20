import { describe, expect, it } from "vitest";
import { buildInstanceTabs, fitTabs, resolveActiveTab } from "./instanceTabs";

const base = {
  contentCount: 0,
  worldCount: 0,
  serverCount: 0,
  hasConfigs: false,
  hasStatistics: false,
  hasServerManager: false,
  hasOwnServer: false,
};

describe("buildInstanceTabs", () => {
  it("always keeps overview, content, worlds, settings and logs", () => {
    expect(buildInstanceTabs(base).map((tab) => tab.id)).toEqual([
      "overview",
      "content",
      "worlds",
      "settings",
      "arguments",
      "logs",
    ]);
  });

  it("keeps logs last so launch history stays reachable", () => {
    const tabs = buildInstanceTabs({
      ...base,
      hasConfigs: true,
      hasStatistics: true,
      hasServerManager: true,
      hasOwnServer: true,
    });

    expect(tabs.at(-1)?.id).toBe("logs");
    expect(tabs.map((tab) => tab.id)).toEqual([
      "overview",
      "content",
      "worlds",
      "servers",
      "server",
      "configs",
      "settings",
      "arguments",
      "statistics",
      "logs",
    ]);
  });

  it("offers configs on a modded instance before its first launch", () => {
    const tabs = buildInstanceTabs({ ...base, isModded: true });

    expect(tabs.map((tab) => tab.id)).toContain("configs");
  });

  it("keeps the instance server tab where a server can be created", () => {
    const tabs = buildInstanceTabs({ ...base, canCreateServer: true });

    expect(tabs.map((tab) => tab.id)).toContain("server");
  });

  it("shows the modpack tab next to the overview for linked packs", () => {
    const tabs = buildInstanceTabs({
      ...base,
      hasModpack: true,
      hasModpackUpdate: true,
    });

    expect(tabs.map((tab) => tab.id).slice(0, 3)).toEqual([
      "overview",
      "modpack",
      "content",
    ]);
    expect(tabs[1].alert).toBe(true);
  });

  it("carries counters for content, worlds and servers", () => {
    const tabs = buildInstanceTabs({
      ...base,
      contentCount: 90,
      worldCount: 3,
      serverCount: 2,
      hasServerManager: true,
    });

    const byId = Object.fromEntries(tabs.map((tab) => [tab.id, tab.count]));
    expect(byId.content).toBe(90);
    expect(byId.worlds).toBe(3);
    expect(byId.servers).toBe(2);
  });

  it("hides the servers tab when the version has no server manager", () => {
    const tabs = buildInstanceTabs({ ...base, serverCount: 5 });
    expect(tabs.some((tab) => tab.id === "servers")).toBe(false);
  });

  it("marks settings when they hold unsaved changes", () => {
    const tabs = buildInstanceTabs({ ...base, hasUnsavedSettings: true });
    expect(tabs.find((tab) => tab.id === "settings")?.alert).toBe(true);
    expect(tabs.find((tab) => tab.id === "arguments")?.alert).toBe(false);
    expect(tabs.find((tab) => tab.id === "content")?.alert).toBeUndefined();
  });

  it("marks arguments on their own tab", () => {
    const tabs = buildInstanceTabs({ ...base, hasUnsavedArguments: true });
    expect(tabs.find((tab) => tab.id === "arguments")?.alert).toBe(true);
    expect(tabs.find((tab) => tab.id === "settings")?.alert).toBe(false);
  });
});

describe("resolveActiveTab", () => {
  it("falls back to overview for a tab that is not present", () => {
    const tabs = buildInstanceTabs(base);
    expect(resolveActiveTab(tabs, "configs")).toBe("overview");
  });

  it("keeps a requested tab that exists", () => {
    const tabs = buildInstanceTabs({ ...base, hasStatistics: true });
    expect(resolveActiveTab(tabs, "statistics")).toBe("statistics");
  });

  it("falls back to overview without a request", () => {
    expect(resolveActiveTab(buildInstanceTabs(base), undefined)).toBe(
      "overview",
    );
  });
});

describe("fitTabs", () => {
  const widths = [80, 90, 100, 70, 110, 120];

  it("shows every tab when they all fit, without the more button", () => {
    expect(fitTabs(widths, 0, 570, 60)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps the leading tabs that fit next to the more button", () => {
    expect(fitTabs(widths, 1, 400, 60)).toEqual([0, 1, 2, 3]);
  });

  it("keeps the open tab on the bar when it would overflow", () => {
    expect(fitTabs(widths, 5, 400, 60)).toEqual([0, 1, 5]);
  });

  it("shows only the open tab when nothing else fits", () => {
    expect(fitTabs(widths, 4, 150, 60)).toEqual([4]);
  });
});
