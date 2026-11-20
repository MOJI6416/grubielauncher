import { getDefaultStore } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import type { MessageBodyType } from "@/types/IMessage";
import { isUsageFeature, type UsageFeature } from "@/shared/usageFeatures";
import { settingsAtom } from "@renderer/stores/atoms";
import { screenKey, routeKey, type Route } from "@renderer/navigation/routes";

const SCREENS: Record<Route["name"], UsageFeature> = {
  home: "screen.home",
  instance: "screen.instance",
  "instance-new": "screen.instanceNew",
  people: "screen.people",
  news: "screen.news",
  agent: "screen.agent",
  profile: "screen.profile",
  accounts: "screen.accounts",
  settings: "screen.settings",
  catalog: "screen.catalog",
};

function subFeature(route: Route, instanceTab: string): string | null {
  switch (route.name) {
    case "instance":
      return `instance.${route.tab ?? instanceTab}`;
    case "people":
      return `people.${route.section ?? "friends"}`;
    case "profile":
      return `profile.${route.tab ?? "profile"}`;
    case "settings":
      return `settings.${route.section ?? "game"}`;
    default:
      return null;
  }
}

export function routeUsage(
  previous: Route | null,
  next: Route,
  instanceTab: string,
): UsageFeature[] {
  if (previous && routeKey(previous) === routeKey(next)) return [];

  const features: UsageFeature[] = [];
  if (!previous || screenKey(previous) !== screenKey(next)) {
    features.push(SCREENS[next.name]);
  }

  const sub = subFeature(next, instanceTab);
  const previousSub = previous ? subFeature(previous, instanceTab) : null;
  const isNewSub =
    !previous || screenKey(previous) !== screenKey(next) || sub !== previousSub;
  if (sub && isNewSub && isUsageFeature(sub)) features.push(sub);

  return features;
}

export function countFeature(feature: UsageFeature): void {
  const settings = getDefaultStore().get(settingsAtom);
  if (settings === DEFAULT_SETTINGS || !settings.usageStats) return;

  try {
    window.api.usage.record(feature);
  } catch {
    return;
  }
}

const MESSAGE_FEATURES: Partial<Record<MessageBodyType, UsageFeature>> = {
  text: "chat.text",
  image: "chat.image",
  sticker: "chat.sticker",
  modpack: "chat.modpack",
  groupInvite: "chat.groupInvite",
};

export function countMessage(type: MessageBodyType): void {
  const feature = MESSAGE_FEATURES[type];
  if (feature) countFeature(feature);
}
