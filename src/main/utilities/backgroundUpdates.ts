import { app } from "electron";
import { AppUpdateCheckResult, AppUpdateState } from "@/types/AppUpdate";
import { mainWindow } from "../windows/mainWindow";
import { scheduleUpdateInstall } from "./updateInstall";
import { gameRuntime } from "./runtime";
import { loadAutoUpdater } from "./autoUpdater";
import { countUsage } from "./usageStats";
import { verifyDownloadedUpdate } from "./updateSignature";

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const FIRST_UPDATE_CHECK_DELAY_MS = 20 * 60 * 1000;

let state: AppUpdateState = { status: "idle" };
let timer: NodeJS.Timeout | null = null;
let started = false;
let checking = false;
let stopping = false;
let onInstall: ((pending: boolean) => void) | null = null;
let rejectedVersion: string | null = null;

function publish(next: AppUpdateState): void {
  state = next;

  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("app:updateState", state);
}

export function rememberRejectedUpdate(version: string): void {
  rejectedVersion = version;
}

export function getAppUpdateState(): AppUpdateState {
  return state;
}

async function check(): Promise<void> {
  if (checking || rejectedVersion || state.status === "ready") return;
  checking = true;

  try {
    const autoUpdater = await loadAutoUpdater();
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
  onInstall: (pending: boolean) => void;
}): void {
  if (started || !app.isPackaged) return;
  started = true;
  onInstall = options.onInstall;

  void loadAutoUpdater().then((autoUpdater) => {
    autoUpdater.on("update-available", (info) => {
      if (state.status === "ready") return;
      publish({ status: "downloading", version: info.version });
    });

    autoUpdater.on("update-downloaded", async (info) => {
      const verdict = await verifyDownloadedUpdate(info);
      if (!verdict.ok) {
        const message = `Update ${info.version} was rejected: ${verdict.reason}`;
        console.warn(`[Updater] ${message}`);
        rejectedVersion = info.version;
        publish({ status: "idle" });
        const contents = mainWindow?.webContents;
        if (contents && !contents.isDestroyed()) {
          contents.send("app:updateFailed", {
            message,
            reason: "signature",
            version: info.version,
          });
        }
        return;
      }
      publish({ status: "ready", version: info.version });
    });

    autoUpdater.on("error", () => {
      if (state.status === "downloading") publish({ status: "idle" });
    });
  });

  const schedule = (delay: number) => {
    if (stopping) return;
    timer = setTimeout(() => {
      void check().finally(() => schedule(UPDATE_CHECK_INTERVAL_MS));
    }, delay);
    timer.unref?.();
  };

  schedule(FIRST_UPDATE_CHECK_DELAY_MS);

  app.on("before-quit", () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    timer = null;
  });
}

export async function checkForAppUpdateNow(): Promise<AppUpdateCheckResult> {
  if (!started || stopping) return { status: "unsupported" };
  if (state.status === "ready") return { status: "ready", version: state.version };
  if (rejectedVersion) return { status: "rejected", version: rejectedVersion };

  try {
    const autoUpdater = await loadAutoUpdater();
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) return { status: "upToDate" };
    const version = result.updateInfo.version;
    if (state.status === "idle") publish({ status: "downloading", version });
    return getAppUpdateState().status === "ready"
      ? { status: "ready", version }
      : { status: "downloading", version };
  } catch (error) {
    if (state.status === "downloading") publish({ status: "idle" });
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function installDownloadedUpdate(): Promise<boolean> {
  if (state.status !== "ready" || !state.version) return false;
  if (gameRuntime.processes.size > 0) return false;
  countUsage("app.update");

  return scheduleUpdateInstall({
    version: state.version,
    delay: 300,
    onInstall: () => onInstall?.(true),
    onError: (error) => {
      onInstall?.(false);
      console.warn("[Updater] Could not install the downloaded update:", error);
      publish({ status: "idle" });
    },
  });
}
