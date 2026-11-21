import { LANGUAGES } from "./Settings";

export type ModTranslationStage =
  | "off"
  | "unsupported"
  | "scanning"
  | "packs"
  | "translating"
  | "building"
  | "ready"
  | "waiting"
  | "deferred"
  | "error";

export interface ModTranslationPackInfo {
  key: string;
  title: string;
  author: string;
  license: string;
  url: string;
}

export type ModTranslationGroup = "mods" | "packs" | "books" | "quests";

export type ModTranslationFormat = "lavender" | "patchouli" | "ftbquests" | "questz";

export interface ModTranslationItem {
  group: ModTranslationGroup;
  title: string;
  format: ModTranslationFormat | null;
  strings: number;
  translated: number;
  pending: number;
  failed: number;
}

export interface ModTranslationStatus {
  versionPath: string;
  enabled: boolean;
  locale: string | null;
  stage: ModTranslationStage;
  progress: { done: number; total: number } | null;
  mods: number;
  packs: ModTranslationPackInfo[];
  translated: number;
  pending: number;
  failed: number;
  items?: ModTranslationItem[];
  needsAccount: boolean;
  error: string | null;
  updatedAt: number | null;
}

export const MANAGED_TRANSLATION_PACK_PREFIX = "grubie-i18n-";

export function isManagedTranslationPack(fileName: string): boolean {
  return fileName.toLowerCase().startsWith(MANAGED_TRANSLATION_PACK_PREFIX);
}

export const MOD_TRANSLATION_LANGUAGES: readonly string[] = ["ru", "uk"];

export function supportsModTranslation(mcVersion: string | undefined): boolean {
  if (!mcVersion) return false;
  const release = /^1\.(\d+)/.exec(mcVersion);
  if (release) return Number(release[1]) >= 6;
  return /^\d{2}(?:\.\d+|w\d{2})/.test(mcVersion);
}

export function modTranslationLocale(
  launcherLang: string | null | undefined,
): string | null {
  if (!launcherLang || !MOD_TRANSLATION_LANGUAGES.includes(launcherLang)) {
    return null;
  }
  const language = LANGUAGES.find((entry) => entry.code === launcherLang);
  return language
    ? `${language.code}_${language.country.toLowerCase()}`
    : null;
}
