import type { AppUpdater } from "electron-updater";

let loading: Promise<AppUpdater> | null = null;

export function loadAutoUpdater(): Promise<AppUpdater> {
  loading ??= import("electron-updater").then((module) => module.autoUpdater);
  return loading;
}
