import { describe, expect, it } from "vitest";
import { DEFAULT_INTERFACE_LAYOUT, type InterfaceLayout } from "@/types/Settings";
import {
  dockEntries,
  isLayoutCustomized,
  moveNav,
  orderedNav,
  placeNav,
  resolveDefaultTab,
  setSlotHidden,
  visibleNav,
  visibleTabs,
} from "./layout";

const layout = (patch: Partial<InterfaceLayout> = {}): InterfaceLayout => ({
  ...DEFAULT_INTERFACE_LAYOUT,
  ...patch,
});

describe("orderedNav", () => {
  it("uses the shipped order by default", () => {
    expect(orderedNav(layout())).toEqual(["play", "people", "news", "settings"]);
  });

  it("keeps a custom order and ignores unknown entries", () => {
    expect(
      orderedNav(layout({ navOrder: ["news", "skins", "play", "people", "settings"] })),
    ).toEqual(["news", "play", "people", "settings"]);
  });

  it("puts entries missing from an old saved order next to their usual neighbour", () => {
    expect(orderedNav(layout({ navOrder: ["settings", "play", "people"] }))).toEqual([
      "settings",
      "play",
      "people",
      "news",
    ]);
    expect(orderedNav(layout({ navOrder: ["news", "settings"] }))).toEqual([
      "play",
      "people",
      "news",
      "settings",
    ]);
  });
});

describe("visibleNav", () => {
  it("hides only the entries that may be hidden", () => {
    const hidden = layout({
      hidden: ["sidebar.people", "sidebar.play", "sidebar.settings"],
    });
    expect(visibleNav(hidden)).toEqual(["play", "news", "settings"]);
  });
});

describe("moveNav and placeNav", () => {
  it("moves an entry one step and forgets the order once it is back to default", () => {
    const moved = moveNav(layout(), "news", -1);
    expect(moved.navOrder).toEqual(["play", "news", "people", "settings"]);
    expect(moveNav(moved, "news", 1).navOrder).toEqual([]);
  });

  it("does not move past the edges", () => {
    expect(moveNav(layout(), "play", -1)).toEqual(layout());
    expect(moveNav(layout(), "settings", 1)).toEqual(layout());
  });

  it("drops an entry before another one or at the end", () => {
    expect(placeNav(layout(), "settings", "play").navOrder).toEqual([
      "settings",
      "play",
      "people",
      "news",
    ]);
    expect(placeNav(layout(), "play", null).navOrder).toEqual([
      "people",
      "news",
      "settings",
      "play",
    ]);
  });
});

describe("setSlotHidden", () => {
  it("adds and removes an id once", () => {
    const hidden = setSlotHidden(setSlotHidden(layout(), "home.hero", true), "home.hero", true);
    expect(hidden.hidden).toEqual(["home.hero"]);
    expect(setSlotHidden(hidden, "home.hero", false).hidden).toEqual([]);
  });
});

describe("resolveDefaultTab", () => {
  it("opens the chosen tab when the instance has it", () => {
    expect(resolveDefaultTab(["overview", "content"], layout({ instanceTab: "content" }))).toBe("content");
  });

  it("falls back to the overview otherwise", () => {
    expect(resolveDefaultTab(["overview", "content"], layout({ instanceTab: "worlds" }))).toBe("overview");
  });
});

describe("visibleTabs", () => {
  const tabs = [{ id: "overview" }, { id: "content" }, { id: "logs" }, { id: "settings" }] as const;

  it("hides rarely used tabs but never the main ones", () => {
    const hidden = layout({
      hidden: ["instance.tab.logs", "instance.tab.content", "instance.tab.settings"],
    });
    expect(visibleTabs([...tabs], hidden).map((tab) => tab.id)).toEqual([
      "overview",
      "content",
      "settings",
    ]);
  });

  it("keeps a hidden tab while it is open", () => {
    const hidden = layout({ hidden: ["instance.tab.logs"] });
    expect(visibleTabs([...tabs], hidden, "logs").map((tab) => tab.id)).toContain("logs");
  });
});

describe("isLayoutCustomized", () => {
  it("is false for the shipped layout only", () => {
    expect(isLayoutCustomized(layout())).toBe(false);
    expect(isLayoutCustomized(layout({ dockLimit: 5 }))).toBe(true);
  });
});

describe("dockEntries", () => {
  const items = ["a", "b", "c", "d", "e"];
  const options = { key: (item: string) => item, pinned: [] as string[], hidden: [] as string[], limit: 0 };

  it("shows everything by default", () => {
    expect(dockEntries(items, options)).toEqual(items);
  });

  it("puts pinned instances first in their pinned order", () => {
    expect(dockEntries(items, { ...options, pinned: ["d", "b"] })).toEqual(["d", "b", "a", "c", "e"]);
  });

  it("drops hidden instances and ignores pins of deleted ones", () => {
    expect(dockEntries(items, { ...options, pinned: ["zz"], hidden: ["a", "c"] })).toEqual(["b", "d", "e"]);
  });

  it("limits the recent part but always keeps pins", () => {
    expect(dockEntries(items, { ...options, pinned: ["e", "d", "c"], limit: 2 })).toEqual(["e", "d", "c"]);
    expect(dockEntries(items, { ...options, pinned: ["e"], limit: 3 })).toEqual(["e", "a", "b"]);
  });
});
