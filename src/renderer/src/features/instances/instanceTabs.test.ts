import { describe, expect, it } from "vitest";
import { buildInstanceTabs, resolveActiveTab } from "./instanceTabs";

const base = {
  contentCount: 0,
  worldCount: 0,
  serverCount: 0,
  hasSaves: false,
  hasConfigs: false,
  hasStatistics: false,
  hasServerManager: false,
  hasOwnServer: false,
};

describe("buildInstanceTabs", () => {
  it("always keeps overview, content, settings and logs", () => {
    expect(buildInstanceTabs(base).map((tab) => tab.id)).toEqual([
      "overview",
      "content",
      "settings",
      "logs",
    ]);
  });

  it("keeps logs last so launch history stays reachable", () => {
    const tabs = buildInstanceTabs({
      ...base,
      hasSaves: true,
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
      "statistics",
      "logs",
    ]);
  });

  it("carries counters for content, worlds and servers", () => {
    const tabs = buildInstanceTabs({
      ...base,
      contentCount: 90,
      worldCount: 3,
      serverCount: 2,
      hasSaves: true,
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

  it("marks content when there are unsaved changes in it", () => {
    const tabs = buildInstanceTabs({ ...base, hasUnsavedContent: true });
    expect(tabs.find((tab) => tab.id === "content")?.alert).toBe(true);
  });
});

describe("resolveActiveTab", () => {
  it("falls back to overview for a tab that is not present", () => {
    const tabs = buildInstanceTabs(base);
    expect(resolveActiveTab(tabs, "worlds")).toBe("overview");
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
