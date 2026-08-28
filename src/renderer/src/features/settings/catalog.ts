import { DEFAULT_SETTINGS, type TSettings } from "@/types/Settings";

export type SettingsSectionId =
  | "game"
  | "downloads"
  | "interface"
  | "voice"
  | "privacy"
  | "storage"
  | "about";

export type SettingsEntryId =
  | "memory"
  | "optimizedJvm"
  | "highPriority"
  | "downloadLimit"
  | "downloadSource"
  | "mirrorRouting"
  | "language"
  | "sounds"
  | "instancesView"
  | "shortcuts"
  | "voiceDevices"
  | "voicePtt"
  | "voiceNoiseSuppression"
  | "autoWorldBackup"
  | "worldBackupKeep"
  | "notifications"
  | "hideServerInRpc"
  | "crashTelemetry"
  | "aiLogAnalysis"
  | "agentChatSync"
  | "devMode"
  | "allowedPaths"
  | "storageUsage"
  | "storageCleanup"
  | "folders"
  | "systemReport"
  | "links"
  | "releaseHistory";

export type SettingsKey = keyof TSettings;

export interface SettingsEntryDef {
  id: SettingsEntryId;
  section: SettingsSectionId;
  keys: SettingsKey[];
  neutral?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSectionId[] = [
  "game",
  "downloads",
  "interface",
  "voice",
  "privacy",
  "storage",
  "about",
];

export const SETTINGS_ENTRIES: SettingsEntryDef[] = [
  { id: "memory", section: "game", keys: ["xmx"] },
  { id: "optimizedJvm", section: "game", keys: ["optimizedJvm"] },
  { id: "highPriority", section: "game", keys: ["highPriority"] },
  { id: "autoWorldBackup", section: "game", keys: ["autoWorldBackup"] },
  { id: "worldBackupKeep", section: "game", keys: ["worldBackupKeep"] },
  { id: "downloadSource", section: "downloads", keys: ["downloadSource"] },
  { id: "downloadLimit", section: "downloads", keys: ["downloadLimit"] },
  { id: "mirrorRouting", section: "downloads", keys: [] },
  { id: "language", section: "interface", keys: ["lang"], neutral: true },
  { id: "sounds", section: "interface", keys: ["sounds"] },
  {
    id: "instancesView",
    section: "interface",
    keys: ["instancesView", "instancesSort"],
  },
  { id: "shortcuts", section: "interface", keys: [] },
  { id: "voiceDevices", section: "voice", keys: [] },
  { id: "voicePtt", section: "voice", keys: ["voicePtt", "voicePttBind"] },
  {
    id: "voiceNoiseSuppression",
    section: "voice",
    keys: ["voiceNoiseSuppression"],
  },
  { id: "notifications", section: "privacy", keys: [] },
  { id: "hideServerInRpc", section: "privacy", keys: ["hideServerInRpc"] },
  { id: "crashTelemetry", section: "privacy", keys: ["crashTelemetry"] },
  { id: "aiLogAnalysis", section: "privacy", keys: ["aiLogAnalysis"] },
  { id: "agentChatSync", section: "privacy", keys: ["agentChatSync"] },
  { id: "devMode", section: "privacy", keys: ["devMode"] },
  { id: "allowedPaths", section: "privacy", keys: [] },
  { id: "storageUsage", section: "storage", keys: [] },
  { id: "storageCleanup", section: "storage", keys: [] },
  { id: "folders", section: "about", keys: [] },
  { id: "systemReport", section: "about", keys: [] },
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

export function sectionEntryIds(
  section: SettingsSectionId,
): SettingsEntryId[] {
  return SETTINGS_ENTRIES.filter((entry) => entry.section === section).map(
    (entry) => entry.id,
  );
}
