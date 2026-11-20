import { atom, getDefaultStore } from "jotai";
import { navigate } from "@renderer/navigation/navigate";
import { entrySection, type SettingsEntryId } from "./catalog";

export interface SettingsFocus {
  id: SettingsEntryId;
  at: number;
}

export const settingsFocusAtom = atom<SettingsFocus | null>(null);

export const FOCUS_TTL_MS = 15_000;
export const FLASH_MS = 1800;

export function openSettingsEntry(id: SettingsEntryId): boolean {
  getDefaultStore().set(settingsFocusAtom, { id, at: Date.now() });
  return navigate({ name: "settings", section: entrySection(id) });
}

export function isFocusFresh(focus: SettingsFocus, now = Date.now()): boolean {
  return now - focus.at <= FOCUS_TTL_MS;
}

export function entrySelector(id: SettingsEntryId): string {
  return `[data-settings-entry~="${id}"]`;
}
