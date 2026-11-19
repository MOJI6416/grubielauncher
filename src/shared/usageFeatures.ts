export const USAGE_FEATURES = [
  "screen.home",
  "screen.instance",
  "screen.instanceNew",
  "screen.people",
  "screen.news",
  "screen.agent",
  "screen.profile",
  "screen.accounts",
  "screen.settings",
  "instance.overview",
  "instance.modpack",
  "instance.content",
  "instance.worlds",
  "instance.servers",
  "instance.server",
  "instance.configs",
  "instance.settings",
  "instance.arguments",
  "instance.statistics",
  "instance.logs",
  "profile.profile",
  "profile.skins",
  "profile.achievements",
  "profile.leaderboard",
  "profile.modpacks",
  "people.friends",
  "people.groups",
  "people.requests",
  "settings.game",
  "settings.downloads",
  "settings.interface",
  "settings.themes",
  "settings.layout",
  "settings.system",
  "settings.voice",
  "settings.privacy",
  "settings.storage",
  "settings.support",
  "settings.about",
  "feature.chunkEditor",
  "feature.layoutEdit",
  "feature.streamerMode",
  "feature.supportReport",
] as const;

export type UsageFeature = (typeof USAGE_FEATURES)[number];

const KNOWN = new Set<string>(USAGE_FEATURES);

export function isUsageFeature(value: unknown): value is UsageFeature {
  return typeof value === "string" && KNOWN.has(value);
}

export const USAGE_MAX_PER_DAY = 500;
export const USAGE_MAX_AGE_DAYS = 14;
