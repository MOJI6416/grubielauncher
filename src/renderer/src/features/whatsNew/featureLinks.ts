import type {
  InstanceTab,
  PeopleSection,
  ProfileTab,
  Route,
} from "@renderer/navigation/routes";
import {
  SETTINGS_ENTRIES,
  type SettingsEntryId,
} from "@renderer/features/settings/catalog";

export type FeatureLink =
  | { kind: "route"; route: Route }
  | { kind: "setting"; id: SettingsEntryId }
  | { kind: "instance"; tab: InstanceTab };

const SCREENS: Partial<Record<string, Route>> = {
  home: { name: "home" },
  news: { name: "news" },
  screenshots: { name: "screenshots" },
  catalog: { name: "catalog" },
  accounts: { name: "accounts" },
  agent: { name: "agent" },
  "instance-new": { name: "instance-new" },
  wardrobe: { name: "wardrobe" },
};

const PROFILE_TABS: ProfileTab[] = ["achievements", "leaderboard", "modpacks"];
const PEOPLE_SECTIONS: PeopleSection[] = ["friends", "groups", "requests"];
const INSTANCE_TABS: InstanceTab[] = [
  "overview",
  "modpack",
  "content",
  "worlds",
  "servers",
  "server",
  "configs",
  "settings",
  "arguments",
  "statistics",
  "logs",
  "bisect",
];
const SETTING_IDS = new Set<string>(SETTINGS_ENTRIES.map((entry) => entry.id));
const SEGMENT = /^[a-z][a-z-]*$/;

export function parseFeatureLink(
  value: string | null | undefined,
  ownProfileId: string,
): FeatureLink | null {
  if (typeof value !== "string") return null;
  const link = value.trim();
  if (!link || link.length > 96) return null;

  if (link.startsWith("setting:")) {
    const id = link.slice("setting:".length);
    return SETTING_IDS.has(id)
      ? { kind: "setting", id: id as SettingsEntryId }
      : null;
  }

  const [head, ...rest] = link.split("/");
  if (rest.some((part) => !SEGMENT.test(part))) return null;

  const screen = SCREENS[head];
  if (screen && rest.length === 0) return { kind: "route", route: screen };

  if (head === "wardrobe" && rest.length === 1 && rest[0] === "catalog") {
    return { kind: "route", route: { name: "wardrobe", view: "catalog" } };
  }

  if (head === "profile" && rest.length <= 1) {
    const tab = rest[0] as ProfileTab | undefined;
    if (tab && !PROFILE_TABS.includes(tab)) return null;
    return {
      kind: "route",
      route: tab
        ? { name: "profile", userId: ownProfileId, tab }
        : { name: "profile", userId: ownProfileId },
    };
  }

  if (head === "people" && rest.length <= 1) {
    const section = rest[0] as PeopleSection | undefined;
    if (section && !PEOPLE_SECTIONS.includes(section)) return null;
    return {
      kind: "route",
      route: section ? { name: "people", section } : { name: "people" },
    };
  }

  if (head === "settings" && rest.length <= 2) {
    const [section, view] = rest;
    return {
      kind: "route",
      route: { name: "settings", section, view },
    };
  }

  if (head === "instance" && rest.length === 1) {
    const tab = rest[0] as InstanceTab;
    return INSTANCE_TABS.includes(tab) ? { kind: "instance", tab } : null;
  }

  return null;
}

export function featureLinksFor(
  highlights: readonly string[],
  links: readonly (string | null)[] | undefined,
  ownProfileId: string,
): (FeatureLink | null)[] {
  return highlights.map((_, index) =>
    parseFeatureLink(links?.[index] ?? null, ownProfileId),
  );
}
