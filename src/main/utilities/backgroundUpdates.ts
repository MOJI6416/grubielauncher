import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { AppUpdateState } from "@/types/AppUpdate";
import { mainWindow } from "../windows/mainWindow";
import { writeUpdateAttempt } from "./updateLoopGuard";
import { gameRuntime } from "./runtime";

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const FIRST_UPDATE_CHECK_DELAY_MS = 20 * 60 * 1000;

let state: AppUpdateState = { status: "idle" };
let timer: NodeJS.Timeout | null = null;
let started = false;
let checking = false;
let onInstall: (() => void) | null = null;
const listeners = new Set<(next: AppUpdateState) => void>();

function publish(next: AppUpdateState): void {
  state = next;
  for (const listener of listeners) listener(state);

  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("app:updateState", state);
}

export function getAppUpdateState(): AppUpdateState {
  return state;
}

export function onAppUpdateState(
  listener: (next: AppUpdateState) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function check(): Promise<void> {
  if (checking || state.status === "ready") return;
  checking = true;

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn(
      "[Updater] Background update check failed:",
      error instanceof Error ? error.message : error,
    );
    if (state.status === "downloading") publish({ status: "idle" });
  } finally {
    checking = false;
  }
}

export function startBackgroundUpdateChecks(options: {
  onInstall: () => void;
}): void {
  if (started || !app.isPackaged) return;
  started = true;
  onInstall = options.onInstall;

  autoUpdater.on("update-available", (info) => {
    if (state.status === "ready") return;
    publish({ status: "downloading", version: info.version });
  });

  autoUpdater.on("update-downloaded", (info) => {
    publish({ status: "ready", version: info.version });
  });

  autoUpdater.on("error", () => {
    if (state.status === "downloading") publish({ status: "idle" });
  });

  const schedule = (delay: number) => {
    timer = setTimeout(() => {
      void check().finally(() => schedule(UPDATE_CHECK_INTERVAL_MS));
    }, delay);
    timer.unref?.();
  };

  schedule(FIRST_UPDATE_CHECK_DELAY_MS);

  app.on("before-quit", () => {
    if (timer) clearTimeout(timer);
    timer = null;
  });
}

export async function installDownloadedUpdate(): Promise<boolean> {
  if (state.status !== "ready" || !state.version) return false;
  if (gameRuntime.processes.size > 0) return false;

  onInstall?.();
  await writeUpdateAttempt(app.getPath("userData"), {
    target: state.version,
    from: app.getVersion(),
    exe: process.execPath,
    at: Date.now(),
  }).catch(() => undefined);

  setTimeout(() => autoUpdater.quitAndInstall(), 300);
  return true;
}
