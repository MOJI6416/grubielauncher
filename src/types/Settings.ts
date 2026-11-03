import {
  DEFAULT_WORLD_BACKUP_KEEP,
  normalizeWorldBackupKeep,
} from "./WorldBackup";
import { AccentId, DEFAULT_ACCENT, isAccentId } from "@/shared/accents";
import { clampGateDb, DEFAULT_GATE_DB } from "@/shared/voiceGate";
import { DEFAULT_UI_SCALE, normalizeUiScale } from "@/shared/uiScale";
import { OVERLAY_CORNERS, type OverlayCorner } from "@/types/Voice";
import { DEFAULT_THEME_ID } from "@/shared/themes";

export const LANGUAGES = [
  { code: "en", label: "English", country: "GB" },
  { code: "ru", label: "Русский", country: "RU" },
  { code: "uk", label: "Українська", country: "UA" },
  { code: "de", label: "Deutsch", country: "DE" },
  { code: "es", label: "Español", country: "MX" },
  { code: "fr", label: "Français", country: "FR" },
  { code: "pl", label: "Polski", country: "PL" },
  { code: "pt", label: "Português (Brasil)", country: "BR" },
  { code: "tr", label: "Türkçe", country: "TR" },
];

const RUSSIAN_READING_LOCALES = ["be", "kk", "ky", "tg", "uz"];

export function matchLanguage(locale: string): string | null {
  const prefix = String(locale || "")
    .toLowerCase()
    .split(/[-_]/)[0];
  if (LANGUAGES.some((language) => language.code === prefix)) return prefix;
  return RUSSIAN_READING_LOCALES.includes(prefix) ? "ru" : null;
}

export type DownloadSource = "auto" | "official" | "mirror";

export type VoicePttBind = {
  type: "key" | "mouse";
  code: number;
  label: string;
};

export type VoicePttCaptureReason =
  | "captured"
  | "cancelled"
  | "timeout"
  | "unavailable"
  | "permission";

export type VoicePttCapture = {
  reason: VoicePttCaptureReason;
  bind: VoicePttBind | null;
};

export const LOG_FONT_SIZES = [10, 11, 12, 13, 14, 16] as const;
export const DEFAULT_LOG_FONT_SIZE = 11;

export function normalizeLogFontSize(value: unknown): number {
  const size = Number(value);
  return LOG_FONT_SIZES.includes(size as (typeof LOG_FONT_SIZES)[number])
    ? size
    : DEFAULT_LOG_FONT_SIZE;
}

export type InstancesView = "list" | "compact" | "grid";
export type MotionSetting = "system" | "on" | "off";
export type GameWindowMode = "minimize" | "tray" | "keep";
export type StartScreen = "home" | "lastInstance" | "people" | "news";

export const MOTION_SETTINGS: MotionSetting[] = ["system", "on", "off"];
export const GAME_WINDOW_MODES: GameWindowMode[] = ["minimize", "tray", "keep"];
export const START_SCREENS: StartScreen[] = [
  "home",
  "lastInstance",
  "people",
  "news",
];
export const DEFAULT_SOUND_VOLUME = 40;

export type InterfaceLayout = {
  hidden: string[];
  navOrder: string[];
  instanceTab: string;
  dockLimit: number;
};

export const DOCK_LIMITS = [0, 5, 10, 15] as const;

export const DEFAULT_INTERFACE_LAYOUT: InterfaceLayout = {
  hidden: [],
  navOrder: [],
  instanceTab: "overview",
  dockLimit: 0,
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && !!item),
    ),
  ];
}

export function normalizeInterfaceLayout(value: unknown): InterfaceLayout {
  if (!value || typeof value !== "object") return DEFAULT_INTERFACE_LAYOUT;
  const raw = value as Partial<Record<keyof InterfaceLayout, unknown>>;
  const dockLimit = Number(raw.dockLimit);

  return {
    hidden: uniqueStrings(raw.hidden),
    navOrder: uniqueStrings(raw.navOrder),
    instanceTab:
      typeof raw.instanceTab === "string" && raw.instanceTab
        ? raw.instanceTab
        : DEFAULT_INTERFACE_LAYOUT.instanceTab,
    dockLimit: DOCK_LIMITS.includes(dockLimit as (typeof DOCK_LIMITS)[number])
      ? dockLimit
      : DEFAULT_INTERFACE_LAYOUT.dockLimit,
  };
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeSoundVolume(value: unknown): number {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return DEFAULT_SOUND_VOLUME;
  return Math.min(100, Math.max(0, Math.round(volume / 5) * 5));
}
export type InstancesSort = "activity" | "playtime" | "name" | "manual";

export type TSettings = {
  xmx: number;
  optimizedJvm: boolean;
  highPriority: boolean;
  lang: string;
  devMode: boolean;
  downloadLimit: number;
  downloadSource: DownloadSource;
  crashTelemetry: boolean;
  aiLogAnalysis: boolean;
  agentChatSync: boolean;
  sounds: boolean;
  hideServerInRpc: boolean;
  streamerMode: boolean;
  streamerModeAuto: boolean;
  voicePtt: boolean;
  voicePttBind: VoicePttBind | null;
  voiceNoiseSuppression: boolean;
  voiceAutoGain: boolean;
  voiceEchoCancellation: boolean;
  voiceGate: boolean;
  voiceGateThreshold: number;
  voiceOverlay: boolean;
  voiceOverlayCorner: OverlayCorner;
  voiceOverlayDisplay: number;
  autoWorldBackup: boolean;
  worldBackupKeep: number;
  instancesView: InstancesView;
  instancesSort: InstancesSort;
  accent: AccentId;
  themeId: string;
  seasonalDecor: boolean;
  closeToTray: boolean | null;
  uiScale: number;
  logFontSize: number;
  motion: MotionSetting;
  ambientTint: boolean;
  backgroundGrain: boolean;
  highContrast: boolean;
  soundVolume: number;
  gameWindow: GameWindowMode;
  restoreAfterGame: boolean;
  startScreen: StartScreen;
  sidebarCollapsed: boolean;
  interface: InterfaceLayout;
};

export function defaultCloseToTray(platform: string): boolean {
  return platform !== "linux";
}

export function resolveCloseToTray(
  value: boolean | null | undefined,
  platform: string,
): boolean {
  return typeof value === "boolean" ? value : defaultCloseToTray(platform);
}

export const DEFAULT_SETTINGS: TSettings = {
  xmx: 2048,
  optimizedJvm: false,
  highPriority: false,
  lang: "en",
  devMode: false,
  downloadLimit: 6,
  downloadSource: "auto",
  crashTelemetry: true,
  aiLogAnalysis: false,
  agentChatSync: true,
  sounds: true,
  hideServerInRpc: true,
  streamerMode: false,
  streamerModeAuto: true,
  voicePtt: false,
  voicePttBind: null,
  voiceNoiseSuppression: false,
  voiceAutoGain: true,
  voiceEchoCancellation: true,
  voiceGate: false,
  voiceGateThreshold: DEFAULT_GATE_DB,
  voiceOverlay: true,
  voiceOverlayCorner: "top-left",
  voiceOverlayDisplay: 0,
  autoWorldBackup: true,
  worldBackupKeep: DEFAULT_WORLD_BACKUP_KEEP,
  instancesView: "list",
  instancesSort: "activity",
  accent: DEFAULT_ACCENT,
  themeId: DEFAULT_THEME_ID,
  seasonalDecor: true,
  closeToTray: null,
  uiScale: DEFAULT_UI_SCALE,
  logFontSize: DEFAULT_LOG_FONT_SIZE,
  motion: "system",
  ambientTint: true,
  backgroundGrain: true,
  highContrast: false,
  soundVolume: DEFAULT_SOUND_VOLUME,
  gameWindow: "minimize",
  restoreAfterGame: true,
  startScreen: "home",
  sidebarCollapsed: false,
  interface: DEFAULT_INTERFACE_LAYOUT,
};

export function normalizeVoicePttBind(value: unknown): VoicePttBind | null {
  if (!value || typeof value !== "object") return null;

  const bind = value as Partial<VoicePttBind>;
  if (bind.type !== "key" && bind.type !== "mouse") return null;
  if (typeof bind.code !== "number" || !Number.isFinite(bind.code)) return null;

  return {
    type: bind.type,
    code: Math.round(bind.code),
    label: typeof bind.label === "string" ? bind.label : String(bind.code),
  };
}

export function normalizeSettings(
  value: Partial<TSettings> | null | undefined,
  fallbackLang = DEFAULT_SETTINGS.lang,
): TSettings {
  const xmx = Number(value?.xmx);
  const downloadLimit = Number(value?.downloadLimit);
  const downloadSource: DownloadSource =
    value?.downloadSource === "official" ||
    value?.downloadSource === "mirror" ||
    value?.downloadSource === "auto"
      ? value.downloadSource
      : DEFAULT_SETTINGS.downloadSource;
  const lang =
    typeof value?.lang === "string" && value.lang.trim()
      ? value.lang
      : fallbackLang;

  const instancesView = oneOf<InstancesView>(
    value?.instancesView,
    ["list", "compact", "grid"],
    DEFAULT_SETTINGS.instancesView,
  );
  const instancesSort: InstancesSort =
    value?.instancesSort === "name" ||
    value?.instancesSort === "manual" ||
    value?.instancesSort === "playtime" ||
    value?.instancesSort === "activity"
      ? value.instancesSort
      : DEFAULT_SETTINGS.instancesSort;

  return {
    instancesView,
    instancesSort,
    accent: isAccentId(value?.accent) ? value.accent : DEFAULT_SETTINGS.accent,
    themeId:
      typeof value?.themeId === "string" && value.themeId.trim()
        ? value.themeId.trim()
        : DEFAULT_SETTINGS.themeId,
    seasonalDecor:
      typeof value?.seasonalDecor === "boolean"
        ? value.seasonalDecor
        : DEFAULT_SETTINGS.seasonalDecor,
    closeToTray:
      typeof value?.closeToTray === "boolean"
        ? value.closeToTray
        : DEFAULT_SETTINGS.closeToTray,
    uiScale: normalizeUiScale(value?.uiScale),
    logFontSize: normalizeLogFontSize(value?.logFontSize),
    motion: oneOf(value?.motion, MOTION_SETTINGS, DEFAULT_SETTINGS.motion),
    ambientTint: booleanOr(value?.ambientTint, DEFAULT_SETTINGS.ambientTint),
    backgroundGrain: booleanOr(
      value?.backgroundGrain,
      DEFAULT_SETTINGS.backgroundGrain,
    ),
    highContrast: booleanOr(value?.highContrast, DEFAULT_SETTINGS.highContrast),
    soundVolume: normalizeSoundVolume(value?.soundVolume),
    gameWindow: oneOf(
      value?.gameWindow,
      GAME_WINDOW_MODES,
      DEFAULT_SETTINGS.gameWindow,
    ),
    restoreAfterGame: booleanOr(
      value?.restoreAfterGame,
      DEFAULT_SETTINGS.restoreAfterGame,
    ),
    startScreen: oneOf(
      value?.startScreen,
      START_SCREENS,
      DEFAULT_SETTINGS.startScreen,
    ),
    sidebarCollapsed: booleanOr(
      value?.sidebarCollapsed,
      DEFAULT_SETTINGS.sidebarCollapsed,
    ),
    interface: normalizeInterfaceLayout(value?.interface),
    xmx:
      Number.isFinite(xmx) && xmx >= 1024
        ? Math.round(xmx)
        : DEFAULT_SETTINGS.xmx,
    optimizedJvm:
      typeof value?.optimizedJvm === "boolean"
        ? value.optimizedJvm
        : DEFAULT_SETTINGS.optimizedJvm,
    highPriority:
      typeof value?.highPriority === "boolean"
        ? value.highPriority
        : DEFAULT_SETTINGS.highPriority,
    lang,
    devMode:
      typeof value?.devMode === "boolean"
        ? value.devMode
        : DEFAULT_SETTINGS.devMode,
    downloadLimit:
      Number.isFinite(downloadLimit) && downloadLimit >= 1
        ? Math.min(16, Math.max(1, Math.round(downloadLimit)))
        : DEFAULT_SETTINGS.downloadLimit,
    downloadSource,
    crashTelemetry:
      typeof value?.crashTelemetry === "boolean"
        ? value.crashTelemetry
        : DEFAULT_SETTINGS.crashTelemetry,
    aiLogAnalysis:
      typeof value?.aiLogAnalysis === "boolean"
        ? value.aiLogAnalysis
        : DEFAULT_SETTINGS.aiLogAnalysis,
    agentChatSync:
      typeof value?.agentChatSync === "boolean"
        ? value.agentChatSync
        : DEFAULT_SETTINGS.agentChatSync,
    sounds:
      typeof value?.sounds === "boolean"
        ? value.sounds
        : DEFAULT_SETTINGS.sounds,
    hideServerInRpc:
      typeof value?.hideServerInRpc === "boolean"
        ? value.hideServerInRpc
        : DEFAULT_SETTINGS.hideServerInRpc,
    streamerMode:
      typeof value?.streamerMode === "boolean"
        ? value.streamerMode
        : DEFAULT_SETTINGS.streamerMode,
    streamerModeAuto:
      typeof value?.streamerModeAuto === "boolean"
        ? value.streamerModeAuto
        : DEFAULT_SETTINGS.streamerModeAuto,
    voicePtt:
      typeof value?.voicePtt === "boolean"
        ? value.voicePtt
        : DEFAULT_SETTINGS.voicePtt,
    voicePttBind: normalizeVoicePttBind(value?.voicePttBind),
    voiceNoiseSuppression:
      typeof value?.voiceNoiseSuppression === "boolean"
        ? value.voiceNoiseSuppression
        : DEFAULT_SETTINGS.voiceNoiseSuppression,
    voiceAutoGain:
      typeof value?.voiceAutoGain === "boolean"
        ? value.voiceAutoGain
        : DEFAULT_SETTINGS.voiceAutoGain,
    voiceEchoCancellation:
      typeof value?.voiceEchoCancellation === "boolean"
        ? value.voiceEchoCancellation
        : DEFAULT_SETTINGS.voiceEchoCancellation,
    voiceGate:
      typeof value?.voiceGate === "boolean"
        ? value.voiceGate
        : DEFAULT_SETTINGS.voiceGate,
    voiceGateThreshold: clampGateDb(value?.voiceGateThreshold),
    voiceOverlay:
      typeof value?.voiceOverlay === "boolean"
        ? value.voiceOverlay
        : DEFAULT_SETTINGS.voiceOverlay,
    voiceOverlayCorner: oneOf(
      value?.voiceOverlayCorner,
      OVERLAY_CORNERS,
      DEFAULT_SETTINGS.voiceOverlayCorner,
    ),
    voiceOverlayDisplay: Number.isSafeInteger(value?.voiceOverlayDisplay)
      ? Number(value?.voiceOverlayDisplay)
      : DEFAULT_SETTINGS.voiceOverlayDisplay,
    autoWorldBackup:
      typeof value?.autoWorldBackup === "boolean"
        ? value.autoWorldBackup
        : DEFAULT_SETTINGS.autoWorldBackup,
    worldBackupKeep: normalizeWorldBackupKeep(value?.worldBackupKeep),
  };
}
