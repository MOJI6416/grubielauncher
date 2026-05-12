import { app } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { autoUpdater } from "electron-updater";
import * as ipcHandlers from "./ipc";
import { lanShareService } from "./share";
import { createMainWindow, mainWindow } from "./windows/mainWindow";
import { createUpdaterWindow, updaterWindow } from "./windows/updaterWindow";
import { rpc } from "./rpc";
import { stopOAuthServer } from "./utilities/authServer";
import path from "path";
import fs from "fs-extra";

const gotTheLock = app.requestSingleInstanceLock();
const APP_SHUTDOWN_TIMEOUT_MS = 5000;
let isAppShutdownInProgress = false;
let appShutdownTimeout: NodeJS.Timeout | null = null;
void gotTheLock;

function sendUpdaterStatus(
  status:
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "not-available"
    | "error",
  payload: { version?: string; message?: string } = {},
) {
  updaterWindow?.webContents.send("updater:status", {
    status,
    ...payload,
  });
}

function openMainWindowOnce() {
  if (mainWindow) return;
  createMainWindow();
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.grubielauncher");

    const appdata = app.getPath("appData");
    const launcherPath = path.join(appdata, ".grubielauncher");
    await fs.ensureDir(launcherPath);

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    Object.values(ipcHandlers).forEach((register) => register());

    if (is.dev) {
      createMainWindow();
      return;
    }

    createUpdaterWindow();

    autoUpdater.on("checking-for-update", () => {
      sendUpdaterStatus("checking");
    });

    autoUpdater.on("update-available", (info) => {
      sendUpdaterStatus("available", { version: info.version });
    });

    autoUpdater.on("download-progress", (p) => {
      sendUpdaterStatus("downloading");
      updaterWindow?.webContents.send("updater:downloadProgress", {
        percent: Number(p.percent.toFixed(1)),
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      });
    });

    autoUpdater.on("update-downloaded", () => {
      sendUpdaterStatus("downloaded");
      setTimeout(() => autoUpdater.quitAndInstall(), 700);
    });

    autoUpdater.on("update-not-available", () => {
      sendUpdaterStatus("not-available");
      updaterWindow?.close();
      openMainWindowOnce();
    });

    autoUpdater.on("error", (error) => {
      sendUpdaterStatus("error", { message: error.message });
      updaterWindow?.close();
      openMainWindowOnce();
    });

    const checkForUpdates = () => {
      sendUpdaterStatus("checking");
      void autoUpdater.checkForUpdates().catch((error) => {
        sendUpdaterStatus("error", { message: error.message });
        updaterWindow?.close();
        openMainWindowOnce();
      });
    };

    if (updaterWindow?.webContents.isLoading()) {
      updaterWindow.webContents.once("did-finish-load", checkForUpdates);
      return;
    }

    checkForUpdates();
  });

  app.on("activate", () => {
    if (process.platform === "darwin" && !mainWindow) {
      createMainWindow();
    }
  });

  app.on("before-quit", (event) => {
    if (isAppShutdownInProgress) {
      return;
    }

    isAppShutdownInProgress = true;
    event.preventDefault();

    appShutdownTimeout = setTimeout(() => {
      console.warn("[Shutdown] Cleanup timed out, forcing app exit.");
      app.exit(0);
    }, APP_SHUTDOWN_TIMEOUT_MS);

    void Promise.allSettled([
      lanShareService.dispose(),
      rpc.dispose(),
      stopOAuthServer("Application shutdown."),
    ]).finally(() => {
      if (appShutdownTimeout) {
        clearTimeout(appShutdownTimeout);
        appShutdownTimeout = null;
      }

      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
