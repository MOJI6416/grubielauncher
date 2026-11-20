import { DEFAULT_SETTINGS, type TSettings } from "@/types/Settings";

export type SettingsSectionId =
  | "game"
  | "downloads"
  | "interface"
  | "themes"
  | "layout"
  | "system"
  | "voice"
  | "privacy"
  | "storage"
  | "support"
  | "about";

export type SettingsEntryId =
  | "memory"
  | "optimizedJvm"
  | "highPriority"
  | "gpuPreference"
  | "linuxTools"
  | "wrapperCommand"
  | "launchEnv"
  | "launchHooks"
  | "java"
  | "downloadLimit"
  | "downloadSource"
  | "mirrorRouting"
  | "modUpdateChannel"
  | "catalogLinks"
  | "language"
  | "theme"
  | "uiScale"
  | "logFontSize"
  | "accent"
  | "highContrast"
  | "motion"
  | "ambientTint"
  | "backgroundGrain"
  | "seasonalDecor"
  | "sidebarCollapsed"
  | "layoutPresets"
  | "layoutCustomize"
  | "layoutSidebar"
  | "layoutDock"
  | "layoutHome"
  | "layoutInstanceTab"
  | "layoutTabs"
  | "layoutOverview"
  | "startScreen"
  | "gameWindow"
  | "closeToTray"
  | "launchAtLogin"
  | "sounds"
  | "instancesView"
  | "shortcuts"
  | "voiceDevices"
  | "voicePtt"
  | "voiceNoiseSuppression"
  | "voiceAutoGain"
  | "voiceEchoCancellation"
  | "voiceGate"
  | "voiceOverlay"
  | "autoWorldBackup"
  | "worldBackupKeep"
  | "sharedGameSettings"
  | "streamerMode"
  | "streamerModeAuto"
  | "notifications"
  | "hideServerInRpc"
  | "directConnect"
  | "crashTelemetry"
  | "usageStats"
  | "packAnalytics"
  | "aiLogAnalysis"
  | "agentChatSync"
  | "devMode"
  | "allowedPaths"
  | "storageUsage"
  | "dataLocation"
  | "storageCleanup"
  | "folders"
  | "systemReport"
  | "supportReport"
  | "verboseJournal"
  | "links"
  | "releaseHistory";

export type SettingsKey = keyof TSettings;

export interface SettingsEntryDef {
  id: SettingsEntryId;
  section: SettingsSectionId;
  keys: SettingsKey[];
  neutral?: boolean;
  platforms?: string[];
}

export const SETTINGS_SECTIONS: SettingsSectionId[] = [
  "game",
  "downloads",
  "interface",
  "themes",
  "layout",
  "system",
  "voice",
  "privacy",
  "storage",
  "support",
  "about",
];

export const SETTINGS_ENTRIES: SettingsEntryDef[] = [
  { id: "memory", section: "game", keys: ["xmx"] },
  { id: "optimizedJvm", section: "game", keys: ["optimizedJvm"] },
  {
    id: "highPriority",
    section: "game",
    keys: ["highPriority"],
    platforms: ["win32"],
  },
  {
    id: "gpuPreference",
    section: "game",
    keys: ["gpuPreference"],
    platforms: ["win32", "linux"],
  },
  {
    id: "linuxTools",
    section: "game",
    keys: ["gameMode", "mangoHud"],
    platforms: ["linux"],
  },
  {
    id: "wrapperCommand",
    section: "game",
    keys: ["wrapperCommand"],
    platforms: ["linux"],
  },
  {
    id: "launchEnv",
    section: "game",
    keys: ["launchEnv"],
    platforms: ["linux"],
  },
  {
    id: "launchHooks",
    section: "game",
    keys: ["preLaunchCommand", "postExitCommand"],
    platforms: ["linux"],
  },
  { id: "java", section: "game", keys: [] },
  { id: "autoWorldBackup", section: "game", keys: ["autoWorldBackup"] },
  { id: "worldBackupKeep", section: "game", keys: ["worldBackupKeep"] },
  { id: "sharedGameSettings", section: "game", keys: [] },
  { id: "downloadSource", section: "downloads", keys: ["downloadSource"] },
  { id: "downloadLimit", section: "downloads", keys: ["downloadLimit"] },
  { id: "mirrorRouting", section: "downloads", keys: [] },
  { id: "modUpdateChannel", section: "downloads", keys: ["modUpdateChannel"] },
  { id: "catalogLinks", section: "downloads", keys: ["catalogLinks"] },
  { id: "language", section: "interface", keys: ["lang"], neutral: true },
  { id: "uiScale", section: "interface", keys: ["uiScale"] },
  { id: "theme", section: "themes", keys: ["themeId"] },
  { id: "accent", section: "themes", keys: ["accent"] },
  { id: "highContrast", section: "interface", keys: ["highContrast"] },
  { id: "motion", section: "interface", keys: ["motion"] },
  { id: "seasonalDecor", section: "interface", keys: ["seasonalDecor"] },
  { id: "sounds", section: "interface", keys: ["sounds", "soundVolume"] },
  { id: "logFontSize", section: "interface", keys: ["logFontSize"] },

  { id: "shortcuts", section: "interface", keys: [] },
  { id: "layoutPresets", section: "layout", keys: [] },
  { id: "layoutCustomize", section: "layout", keys: ["interface"] },
  { id: "sidebarCollapsed", section: "layout", keys: ["sidebarCollapsed"] },
  { id: "ambientTint", section: "layout", keys: ["ambientTint"] },
  { id: "backgroundGrain", section: "layout", keys: ["backgroundGrain"] },
  { id: "layoutSidebar", section: "layout", keys: [] },
  { id: "layoutDock", section: "layout", keys: [] },
  {
    id: "instancesView",
    section: "layout",
    keys: ["instancesView", "instancesSort"],
  },
  { id: "layoutHome", section: "layout", keys: [] },
  { id: "layoutInstanceTab", section: "layout", keys: [] },
  { id: "layoutTabs", section: "layout", keys: [] },
  { id: "layoutOverview", section: "layout", keys: [] },
  { id: "closeToTray", section: "system", keys: ["closeToTray"] },
  { id: "startScreen", section: "system", keys: ["startScreen"] },
  {
    id: "gameWindow",
    section: "system",
    keys: ["gameWindow", "restoreAfterGame"],
  },
  { id: "launchAtLogin", section: "system", keys: [] },
  { id: "voiceDevices", section: "voice", keys: [] },
  { id: "voicePtt", section: "voice", keys: ["voicePtt", "voicePttBind"] },
  {
    id: "voiceNoiseSuppression",
    section: "voice",
    keys: ["voiceNoiseSuppression"],
  },
  { id: "voiceAutoGain", section: "voice", keys: ["voiceAutoGain"] },
  {
    id: "voiceEchoCancellation",
    section: "voice",
    keys: ["voiceEchoCancellation"],
  },
  {
    id: "voiceGate",
    section: "voice",
    keys: ["voiceGate", "voiceGateThreshold"],
  },
  {
    id: "voiceOverlay",
    section: "voice",
    keys: ["voiceOverlay", "voiceOverlayCorner", "voiceOverlayDisplay"],
  },
  { id: "streamerMode", section: "privacy", keys: ["streamerMode"] },
  { id: "streamerModeAuto", section: "privacy", keys: ["streamerModeAuto"] },
  { id: "notifications", section: "privacy", keys: [] },
  { id: "hideServerInRpc", section: "privacy", keys: ["hideServerInRpc"] },
  { id: "directConnect", section: "privacy", keys: ["directConnect"] },
  { id: "crashTelemetry", section: "privacy", keys: ["crashTelemetry"] },
  { id: "usageStats", section: "privacy", keys: ["usageStats"] },
  { id: "packAnalytics", section: "privacy", keys: ["packAnalytics"] },
  { id: "aiLogAnalysis", section: "privacy", keys: ["aiLogAnalysis"] },
  { id: "agentChatSync", section: "privacy", keys: ["agentChatSync"] },
  { id: "allowedPaths", section: "privacy", keys: [] },
  { id: "storageUsage", section: "storage", keys: [] },
  { id: "dataLocation", section: "storage", keys: [] },
  { id: "storageCleanup", section: "storage", keys: [] },
  { id: "supportReport", section: "support", keys: [] },
  { id: "verboseJournal", section: "support", keys: [] },
  { id: "devMode", section: "support", keys: ["devMode"] },
  { id: "systemReport", section: "support", keys: [] },
  { id: "folders", section: "about", keys: [] },
  { id: "links", section: "about", keys: [] },
  { id: "releaseHistory", section: "about", keys: [] },
];

const ENTRY_BY_ID = new Map(SETTINGS_ENTRIES.map((entry) => [entry.id, entry]));

export function entrySection(id: SettingsEntryId): SettingsSectionId {
  return ENTRY_BY_ID.get(id)?.section ?? "game";
}

export function isSettingsSection(
  value: string | undefined,
): value is SettingsSectionId {
  return (
    typeof value === "string" &&
    (SETTINGS_SECTIONS as string[]).includes(value)
  );
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isKeyChanged(settings: TSettings, key: SettingsKey): boolean {
  return !isEqual(settings[key], DEFAULT_SETTINGS[key]);
}

export function changedEntryIds(settings: TSettings): SettingsEntryId[] {
  return SETTINGS_ENTRIES.filter(
    (entry) =>
      !entry.neutral && entry.keys.some((key) => isKeyChanged(settings, key)),
  ).map((entry) => entry.id);
}

export function changedCountBySection(
  settings: TSettings,
): Record<SettingsSectionId, number> {
  const counts = Object.fromEntries(
    SETTINGS_SECTIONS.map((section) => [section, 0]),
  ) as Record<SettingsSectionId, number>;

  for (const id of changedEntryIds(settings)) {
    counts[entrySection(id)] += 1;
  }

  return counts;
}

export function defaultsPatch(
  settings: TSettings,
  ids: SettingsEntryId[],
): Partial<TSettings> {
  const patch: Partial<TSettings> = {};

  for (const id of ids) {
    const entry = ENTRY_BY_ID.get(id);
    if (!entry || entry.neutral) continue;

    for (const key of entry.keys) {
      if (!isKeyChanged(settings, key)) continue;
      Object.assign(patch, { [key]: DEFAULT_SETTINGS[key] });
    }
  }

  return patch;
}

export function isEntryAvailable(
  entry: SettingsEntryDef,
  platform: string,
): boolean {
  return !entry.platforms || entry.platforms.includes(platform);
}

export function sectionEntryIds(
  section: SettingsSectionId,
): SettingsEntryId[] {
  return SETTINGS_ENTRIES.filter((entry) => entry.section === section).map(
    (entry) => entry.id,
  );
}
