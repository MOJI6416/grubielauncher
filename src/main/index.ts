import { app, session } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { autoUpdater } from "electron-updater";
import * as ipcHandlers from "./ipc";
import { lanShareService } from "./share";
import { createMainWindow, mainWindow } from "./windows/mainWindow";
import { createUpdaterWindow, updaterWindow } from "./windows/updaterWindow";
import { rpc } from "./rpc";
import { stopOAuthServer } from "./utilities/authServer";
import {
  extractLauncherDeepLink,
  parseLauncherDeepLink,
} from "./utilities/deepLink";
import { initMirrorState } from "./utilities/mirrorState";
import { LauncherDeepLink } from "@/types/DeepLink";
import path from "path";
import fs from "fs-extra";

app.commandLine.appendSwitch(
  "disable-features",
  "SpareRendererForSitePerProcess",
);
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=1024");

const gotTheLock = app.requestSingleInstanceLock();
const APP_PROTOCOL = "grubielauncher";
const APP_SHUTDOWN_TIMEOUT_MS = 5000;
let isAppShutdownInProgress = false;
let appShutdownTimeout: NodeJS.Timeout | null = null;
const pendingDeepLinks: LauncherDeepLink[] = [];
void gotTheLock;

function setupContentSecurityPolicy() {
  if (is.dev) return;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https: http:",
            "media-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self' https: http: ws: wss:",
          ].join("; "),
        ],
      },
    });
  });
}

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

function notifyMainWindowUpdateFailed(message: string) {
  openMainWindowOnce();
  if (!mainWindow) return;

  const send = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send("app:updateFailed", { message });
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(send, 1500);
    });
    return;
  }

  send();
}

function registerProtocolClient() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    return;
  }

  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

function focusMainWindow() {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function sendDeepLinkToRenderer(link: LauncherDeepLink) {
  openMainWindowOnce();
  if (!mainWindow) return;

  focusMainWindow();

  const send = () => {
    mainWindow?.webContents.send("app:deepLink", link);
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", send);
    return;
  }

  send();
}

function deliverDeepLink(link: LauncherDeepLink) {
  if (!app.isReady()) {
    pendingDeepLinks.push(link);
    return;
  }

  sendDeepLinkToRenderer(link);
}

function flushPendingDeepLinks() {
  const links = pendingDeepLinks.splice(0);
  links.forEach((link) => sendDeepLinkToRenderer(link));
}

function handleDeepLinkUrl(rawUrl: string) {
  const link = parseLauncherDeepLink(rawUrl);
  if (!link) return;

  deliverDeepLink(link);
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = extractLauncherDeepLink(argv);
    if (link) {
      deliverDeepLink(link);
      return;
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLinkUrl(url);
  });

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.grubielauncher");
    setupContentSecurityPolicy();
    registerProtocolClient();

    const appdata = app.getPath("appData");
    const launcherPath = path.join(appdata, ".grubielauncher");
    await fs.ensureDir(launcherPath);

    void initMirrorState(launcherPath);

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    Object.values(ipcHandlers).forEach((register) => register());

    const initialDeepLink = extractLauncherDeepLink(process.argv);
    if (initialDeepLink) pendingDeepLinks.push(initialDeepLink);

    if (is.dev) {
      createMainWindow();
      flushPendingDeepLinks();
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
      flushPendingDeepLinks();
    });

    autoUpdater.on("error", (error) => {
      sendUpdaterStatus("error", { message: error.message });
      updaterWindow?.close();
      notifyMainWindowUpdateFailed(error.message);
      flushPendingDeepLinks();
    });

    const checkForUpdates = () => {
      sendUpdaterStatus("checking");
      void autoUpdater.checkForUpdates().catch((error) => {
        sendUpdaterStatus("error", { message: error.message });
        updaterWindow?.close();
        notifyMainWindowUpdateFailed(error.message);
        flushPendingDeepLinks();
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
