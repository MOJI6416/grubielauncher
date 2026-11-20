import { DEFAULT_SETTINGS, normalizeSettings, type TSettings } from "@/types/Settings";

export const SYNCED_SETTING_KEYS = [
  "lang",
  "accent",
  "themeId",
  "highContrast",
  "motion",
  "seasonalDecor",
  "sounds",
  "soundVolume",
  "logFontSize",
  "interface",
  "sidebarCollapsed",
  "ambientTint",
  "backgroundGrain",
  "instancesView",
  "instancesSort",
  "startScreen",
  "gameWindow",
  "restoreAfterGame",
  "modUpdateChannel",
  "catalogLinks",
  "autoWorldBackup",
  "worldBackupKeep",
  "voicePtt",
  "voiceNoiseSuppression",
  "voiceAutoGain",
  "voiceEchoCancellation",
  "voiceGate",
  "voiceOverlay",
  "voiceOverlayCorner",
  "overlayToasts",
  "streamerModeAuto",
  "discordActivity",
  "hideServerInRpc",
] as const satisfies readonly (keyof TSettings)[];

export type SyncedSettingKey = (typeof SYNCED_SETTING_KEYS)[number];

export type SettingsStamps = Partial<Record<SyncedSettingKey, number>>;

export interface RemoteSettings {
  values: Record<string, unknown>;
  stamps: Record<string, number>;
}

const SYNCED = new Set<string>(SYNCED_SETTING_KEYS);

export function isSyncedSettingKey(key: string): key is SyncedSettingKey {
  return SYNCED.has(key);
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function validStamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function normalizeStamps(value: unknown): SettingsStamps {
  const stamps: SettingsStamps = {};
  if (!value || typeof value !== "object") return stamps;
  for (const key of SYNCED_SETTING_KEYS) {
    const stamp = (value as Record<string, unknown>)[key];
    if (validStamp(stamp)) stamps[key] = Math.floor(stamp);
  }
  return stamps;
}

export function stampChanges(
  previous: TSettings,
  next: TSettings,
  stamps: SettingsStamps,
  at: number,
): SettingsStamps | null {
  let changed: SettingsStamps | null = null;
  for (const key of SYNCED_SETTING_KEYS) {
    if (sameValue(previous[key], next[key])) continue;
    changed ??= { ...stamps };
    changed[key] = Math.max(at, (stamps[key] ?? 0) + 1);
  }
  return changed;
}

export function initialStamps(settings: TSettings, at: number): SettingsStamps {
  const stamps: SettingsStamps = {};
  for (const key of SYNCED_SETTING_KEYS) {
    if (!sameValue(settings[key], DEFAULT_SETTINGS[key])) stamps[key] = at;
  }
  return stamps;
}

export function settingsPushPayload(
  settings: TSettings,
  stamps: SettingsStamps,
): RemoteSettings {
  const payload: RemoteSettings = { values: {}, stamps: {} };
  for (const key of SYNCED_SETTING_KEYS) {
    const stamp = stamps[key];
    if (!validStamp(stamp)) continue;
    payload.values[key] = settings[key];
    payload.stamps[key] = stamp;
  }
  return payload;
}

export function applyRemoteSettings(
  settings: TSettings,
  stamps: SettingsStamps,
  remote: RemoteSettings,
): { patch: Partial<TSettings>; stamps: SettingsStamps } {
  const patch: Partial<TSettings> = {};
  const nextStamps: SettingsStamps = { ...stamps };

  for (const key of SYNCED_SETTING_KEYS) {
    const stamp = remote.stamps?.[key];
    if (!validStamp(stamp) || !(key in (remote.values ?? {}))) continue;
    if (stamp <= (stamps[key] ?? 0)) continue;

    const value = normalizeSettings(
      { ...settings, [key]: remote.values[key] },
      settings.lang,
    )[key];
    nextStamps[key] = stamp;
    if (!sameValue(value, settings[key])) {
      Object.assign(patch, { [key]: value });
    }
  }

  return { patch, stamps: nextStamps };
}
