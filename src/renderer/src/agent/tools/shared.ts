import { getDefaultStore } from "jotai";
import { TSettings } from "@/types/Settings";
import {
  installActiveAtom,
  isRunningAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { Version } from "@renderer/classes/Version";
import i18n from "@renderer/i18n";
import { formatBytes } from "@renderer/utilities/file";
import { formatDate } from "@renderer/utilities/date";

const api = window.api;

export function previewSize(bytes: number): string {
  return formatBytes(
    bytes,
    [0, 1, 2, 3, 4].map((index) => i18n.t(`sizes.${index}`)),
    1,
  );
}

export function previewDate(time: number): string {
  return formatDate(new Date(time));
}

export function settings(): TSettings {
  return getDefaultStore().get(settingsAtom);
}

export function busyError(): string | null {
  const store = getDefaultStore();
  if (store.get(installActiveAtom)) {
    return "Another install or download is already running in the launcher. Ask the user to wait for it to finish.";
  }
  if (store.get(isRunningAtom)) {
    return "The game is currently running. Some changes are not safe while it is open.";
  }
  return null;
}

export function refreshVersions(): void {
  const store = getDefaultStore();
  store.set(versionsAtom, [...store.get(versionsAtom)]);
}

export const SAVE_FAILED =
  "The launcher could not write the instance file, so nothing was changed on disk. Its folder may be locked by the game, an antivirus or a full disk. Tell the user the change did not apply.";

export async function saveInstance(version: Version): Promise<string | null> {
  return (await version.save()) ? null : SAVE_FAILED;
}

export async function syncMods(version: Version): Promise<string | null> {
  const result = await api.mods.check(settings(), version.version);

  if (!result) return "The launcher did not answer the mod sync request";
  if (result.cancelled) return "The mod sync was cancelled";
  if (!result.success) return result.error || "The mod sync failed";

  return null;
}
