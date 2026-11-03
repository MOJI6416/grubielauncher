import {
  DEFAULT_INTERFACE_LAYOUT,
  type InterfaceLayout,
} from "@/types/Settings";
import type { InstanceTab } from "@renderer/navigation/routes";

export type NavSlot = "play" | "people" | "news" | "settings";
export type SidebarSection = "dock" | "now";
export type HomeBlock = "hero" | "stats" | "continue";
export type OverviewCard = "screenshots" | "notes" | "sessions";

export const NAV_SLOTS: NavSlot[] = ["play", "people", "news", "settings"];
export const FIXED_NAV_SLOTS: NavSlot[] = ["play", "settings"];
export const SIDEBAR_SECTIONS: SidebarSection[] = ["dock", "now"];
export const HOME_BLOCKS: HomeBlock[] = ["hero", "stats", "continue"];
export const OVERVIEW_CARDS: OverviewCard[] = ["screenshots", "notes", "sessions"];
export const HIDEABLE_TABS: InstanceTab[] = [
  "worlds",
  "servers",
  "server",
  "configs",
  "statistics",
  "logs",
];
export const DEFAULT_TAB_CHOICES: InstanceTab[] = [
  "overview",
  "content",
  "worlds",
  "servers",
  "settings",
];

export const slotId = {
  nav: (slot: NavSlot) => `sidebar.${slot}`,
  section: (section: SidebarSection) => `sidebar.${section}`,
  home: (block: HomeBlock) => `home.${block}`,
  tab: (tab: InstanceTab) => `instance.tab.${tab}`,
  card: (card: OverviewCard) => `overview.${card}`,
};

export function isNavFixed(slot: NavSlot): boolean {
  return FIXED_NAV_SLOTS.includes(slot);
}

export function isSlotHidden(layout: InterfaceLayout, id: string): boolean {
  return layout.hidden.includes(id);
}

export function setSlotHidden(
  layout: InterfaceLayout,
  id: string,
  hidden: boolean,
): InterfaceLayout {
  const rest = layout.hidden.filter((item) => item !== id);
  return { ...layout, hidden: hidden ? [...rest, id] : rest };
}

export function orderedNav(layout: InterfaceLayout): NavSlot[] {
  const result = layout.navOrder.filter((id): id is NavSlot =>
    NAV_SLOTS.includes(id as NavSlot),
  );

  NAV_SLOTS.forEach((slot, index) => {
    if (result.includes(slot)) return;
    const previous = NAV_SLOTS.slice(0, index)
      .reverse()
      .find((item) => result.includes(item));
    result.splice(previous ? result.indexOf(previous) + 1 : 0, 0, slot);
  });

  return result;
}

export function visibleNav(layout: InterfaceLayout): NavSlot[] {
  return orderedNav(layout).filter(
    (slot) => isNavFixed(slot) || !isSlotHidden(layout, slotId.nav(slot)),
  );
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function withNavOrder(
  layout: InterfaceLayout,
  order: NavSlot[],
): InterfaceLayout {
  return { ...layout, navOrder: sameOrder(order, NAV_SLOTS) ? [] : order };
}

export function moveNav(
  layout: InterfaceLayout,
  slot: NavSlot,
  delta: number,
): InterfaceLayout {
  const order = orderedNav(layout);
  const from = order.indexOf(slot);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= order.length) return layout;

  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, slot);
  return withNavOrder(layout, next);
}

export function placeNav(
  layout: InterfaceLayout,
  slot: NavSlot,
  before: NavSlot | null,
): InterfaceLayout {
  const order = orderedNav(layout).filter((item) => item !== slot);
  const index = before ? order.indexOf(before) : order.length;
  order.splice(index === -1 ? order.length : index, 0, slot);
  return withNavOrder(layout, order);
}

export function resolveDefaultTab(
  available: InstanceTab[],
  layout: InterfaceLayout,
): InstanceTab {
  const wanted = layout.instanceTab as InstanceTab;
  return available.includes(wanted) ? wanted : "overview";
}

export function visibleTabs<T extends { id: InstanceTab }>(
  tabs: T[],
  layout: InterfaceLayout,
  active?: InstanceTab,
): T[] {
  return tabs.filter(
    (tab) =>
      tab.id === active ||
      !HIDEABLE_TABS.includes(tab.id) ||
      !isSlotHidden(layout, slotId.tab(tab.id)),
  );
}

export function isLayoutCustomized(layout: InterfaceLayout): boolean {
  return JSON.stringify(layout) !== JSON.stringify(DEFAULT_INTERFACE_LAYOUT);
}

export function dockEntries<T>(
  instances: T[],
  options: {
    key: (instance: T) => string;
    pinned: string[];
    hidden: string[];
    limit: number;
  },
): T[] {
  const byKey = new Map(instances.map((instance) => [options.key(instance), instance]));
  const pinned = options.pinned
    .map((key) => byKey.get(key))
    .filter((instance): instance is T => !!instance);
  const pinnedKeys = new Set(pinned.map(options.key));
  const rest = instances.filter((instance) => {
    const key = options.key(instance);
    return !pinnedKeys.has(key) && !options.hidden.includes(key);
  });
  const restLimit =
    options.limit > 0 ? Math.max(0, options.limit - pinned.length) : rest.length;

  return [...pinned, ...rest.slice(0, restLimit)];
}
