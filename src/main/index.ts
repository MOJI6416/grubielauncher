import { app, crashReporter, Menu, net, protocol, session } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { pathToFileURL } from "url";
import {
  isLegacyLocalStorageDumpRunning,
  prepareLegacyLocalStorageDump,
  registerLegacyLocalStorageIpc,
} from "./utilities/localStorageMigration";
import { autoUpdater } from "electron-updater";
import * as ipcHandlers from "./ipc";
import { lanShareService } from "./share";
import {
  createMainWindow,
  mainWindow,
  showMainWindow,
} from "./windows/mainWindow";
import { createUpdaterWindow, updaterWindow } from "./windows/updaterWindow";
import { rpc } from "./rpc";
import { stopOAuthServer } from "./utilities/authServer";
import { isReadablePath } from "./utilities/safePath";
import {
  extractLauncherDeepLink,
  parseLauncherDeepLink,
} from "./utilities/deepLink";
import { initMirrorState } from "./utilities/mirrorState";
import { MIRROR_BASE } from "./utilities/mirrors";
import { reportFailure } from "./utilities/failureBus";
import { gameRuntime } from "./utilities/runtime";
import { endSession } from "./utilities/statistics";
import { hasRunningServers, stopServersForShutdown } from "./game/Server";
import { registerAppImageDesktopEntry } from "./utilities/linuxDesktopEntry";
import { disposePushToTalk } from "./services/PushToTalk";
import { initWorldBackupService } from "./services/WorldBackupService";
import { LauncherDeepLink } from "@/types/DeepLink";
import path from "path";
import fs from "fs-extra";

app.commandLine.appendSwitch(
  "disable-features",
  "SpareRendererForSitePerProcess",
);

crashReporter.start({
  productName: "GrubieLauncher",
  companyName: "GrubieLauncher",
  uploadToServer: false,
  compress: true,
});

Menu.setApplicationMenu(null);

const APP_SCHEME = "app";
const APP_BUNDLE_HOST = "bundle";
const APP_MEDIA_HOST = "media";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      codeCache: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
  try {
    reportFailure(error, { channel: "main:uncaughtException" });
  } catch {}
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  try {
    reportFailure(reason, { channel: "main:unhandledRejection" });
  } catch {}
});

const gotTheLock = app.requestSingleInstanceLock();
const APP_PROTOCOL = "grubielauncher";
const APP_SHUTDOWN_TIMEOUT_MS = 5000;
const APP_SERVER_SHUTDOWN_TIMEOUT_MS = 45000;
const APP_UPDATE_SHUTDOWN_TIMEOUT_MS = 1000;
const UPDATE_MIRROR_URL = `${MIRROR_BASE}/updates/`;
const UPDATE_CHECK_TIMEOUT_MS = 20000;
const UPDATE_STALL_TIMEOUT_MS = 90000;
const UPDATE_WATCHDOG_TICK_MS = 2500;
let isAppShutdownInProgress = false;
let isUpdateInstallPending = false;
let appShutdownTimeout: NodeJS.Timeout | null = null;
const pendingDeepLinks: LauncherDeepLink[] = [];
void gotTheLock;

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' blob: 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' app: data: blob: https: http:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: https: wss:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

const CSP_REPORT_ONLY_POLICY = "require-trusted-types-for 'script'";

const CDN_CORS_HOST = "cdn.grubielauncher.com";

const APP_MEDIA_TYPES_BY_EXTENSION = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".avif", "image/avif"],
  [".ico", "image/x-icon"],
]);

const APP_MEDIA_ALLOWED_TYPES = new Set([
  ...APP_MEDIA_TYPES_BY_EXTENSION.values(),
  "image/vnd.microsoft.icon",
]);

function setupContentSecurityPolicy() {
  if (is.dev) return;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = {
      ...details.responseHeaders,
      "Content-Security-Policy": [CSP_POLICY],
      "Content-Security-Policy-Report-Only": [CSP_REPORT_ONLY_POLICY],
    };

    try {
      if (new URL(details.url).hostname === CDN_CORS_HOST) {
        for (const key of Object.keys(responseHeaders)) {
          if (key.toLowerCase() === "access-control-allow-origin") {
            delete responseHeaders[key];
          }
        }
        responseHeaders["Access-Control-Allow-Origin"] = ["*"];
      }
    } catch {}

    callback({ responseHeaders });
  });
}

function isMainWindowContents(contents: Electron.WebContents | null): boolean {
  if (!contents || !mainWindow || mainWindow.isDestroyed()) return false;
  return contents === mainWindow.webContents;
}

function isAudioOnlyMediaRequest(details?: {
  mediaTypes?: string[];
  mediaType?: string;
}): boolean {
  if (Array.isArray(details?.mediaTypes) && details.mediaTypes.length > 0) {
    return details.mediaTypes.every((type) => type === "audio");
  }
  return details?.mediaType === "audio";
}

function setupPermissionHandlers() {
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      const allowed =
        permission === "media" &&
        isMainWindowContents(contents) &&
        isAudioOnlyMediaRequest(details as { mediaTypes?: string[] });

      if (!allowed) {
        console.warn(`[Permission] denied request: ${permission}`);
      }

      callback(allowed);
    },
  );

  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, _origin, details) => {
      return (
        permission === "media" &&
        isMainWindowContents(contents) &&
        isAudioOnlyMediaRequest(details as { mediaType?: string })
      );
    },
  );

  session.defaultSession.setDevicePermissionHandler(() => false);
}

function registerAppProtocol() {
  const rendererRoot = path.resolve(path.join(__dirname, "../renderer"));

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      return new Response(null, { status: 403 });
    }

    // Local images (version logos, world icons, skin library, import
    // previews). Same allow-list as the fs read IPC: launcher data dir,
    // temp, app resources and user-picked (blessed) paths.
    if (url.host === APP_MEDIA_HOST) {
      const rawPath = url.searchParams.get("p") || "";

      if (!rawPath || !isReadablePath(rawPath)) {
        return new Response(null, { status: 403 });
      }

      const resolved = path.resolve(rawPath);

      try {
        const mediaResponse = await net.fetch(
          pathToFileURL(resolved).toString(),
          { bypassCustomProtocolHandlers: true },
        );
        const contentType =
          APP_MEDIA_TYPES_BY_EXTENSION.get(
            path.extname(resolved).toLowerCase(),
          ) ??
          (mediaResponse.headers.get("content-type") || "")
            .split(";")[0]
            .trim()
            .toLowerCase();

        if (!APP_MEDIA_ALLOWED_TYPES.has(contentType)) {
          return new Response(null, { status: 415 });
        }

        const mediaHeaders = new Headers(mediaResponse.headers);
        mediaHeaders.set("Access-Control-Allow-Origin", "*");
        mediaHeaders.set("Content-Type", contentType);
        mediaHeaders.set("X-Content-Type-Options", "nosniff");
        return new Response(mediaResponse.body, {
          status: mediaResponse.status,
          statusText: mediaResponse.statusText,
          headers: mediaHeaders,
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    }

    if (url.host !== APP_BUNDLE_HOST) {
      return new Response(null, { status: 403 });
    }

    const pathname = decodeURIComponent(url.pathname);
    const resolved = path.resolve(
      path.join(rendererRoot, pathname === "/" ? "index.html" : pathname),
    );

    if (
      resolved !== rendererRoot &&
      !resolved.startsWith(rendererRoot + path.sep)
    ) {
      return new Response(null, { status: 403 });
    }

    const response = await net.fetch(pathToFileURL(resolved).toString(), {
      bypassCustomProtocolHandlers: true,
    });

    if (!resolved.toLowerCase().endsWith(".html")) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", CSP_POLICY);
    headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY_POLICY);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
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
  showMainWindow();
  if (!mainWindow) return;

  const send = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send("app:updateFailed", { message });
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", send);
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
  void registerAppImageDesktopEntry(APP_PROTOCOL);
}

function focusMainWindow() {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) mainWindow.restore();
  showMainWindow();
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

    focusMainWindow();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLinkUrl(url);
  });

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.grubielauncher");
    setupContentSecurityPolicy();
    setupPermissionHandlers();
    registerAppProtocol();
    registerProtocolClient();

    const appdata = app.getPath("appData");
    const launcherPath = path.join(appdata, ".grubielauncher");
    await fs.ensureDir(launcherPath);

    void initMirrorState(launcherPath);

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    Object.values(ipcHandlers).forEach((register) => register());
    registerLegacyLocalStorageIpc();
    initWorldBackupService();

    const usesAppProtocol = !(is.dev && process.env["ELECTRON_RENDERER_URL"]);
    if (usesAppProtocol) {
      await prepareLegacyLocalStorageDump();
    }

    const initialDeepLink = extractLauncherDeepLink(process.argv);
    if (initialDeepLink) pendingDeepLinks.push(initialDeepLink);

    if (is.dev) {
      createMainWindow();
      flushPendingDeepLinks();
      return;
    }

    createUpdaterWindow();
    createMainWindow({ deferShow: true });

    autoUpdater.disableDifferentialDownload = true;

    let updateFlowSettled = false;
    let mirrorFeedTried = false;
    let updateWatchdog: NodeJS.Timeout | null = null;
    let updateStallLimitMs = UPDATE_CHECK_TIMEOUT_MS;
    let updateActivityAt = Date.now();

    const clearUpdateWatchdog = () => {
      if (!updateWatchdog) return;
      clearInterval(updateWatchdog);
      updateWatchdog = null;
    };

    const markUpdateActivity = (stallLimitMs?: number) => {
      updateActivityAt = Date.now();
      if (stallLimitMs !== undefined) updateStallLimitMs = stallLimitMs;
    };

    autoUpdater.on("checking-for-update", () => {
      markUpdateActivity();
      sendUpdaterStatus("checking");
    });

    autoUpdater.on("update-available", (info) => {
      markUpdateActivity(UPDATE_STALL_TIMEOUT_MS);
      sendUpdaterStatus("available", { version: info.version });
    });

    autoUpdater.on("download-progress", (p) => {
      markUpdateActivity(UPDATE_STALL_TIMEOUT_MS);
      sendUpdaterStatus("downloading");
      updaterWindow?.webContents.send("updater:downloadProgress", {
        percent: Number(p.percent.toFixed(1)),
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      });
    });

    const continueWithoutUpdate = () => {
      if (updateFlowSettled) return;
      updateFlowSettled = true;
      clearUpdateWatchdog();

      sendUpdaterStatus("not-available");
      updaterWindow?.close();
      openMainWindowOnce();
      showMainWindow();
      flushPendingDeepLinks();
    };

    const continueWithFailedUpdate = (message: string) => {
      if (updateFlowSettled) return;
      updateFlowSettled = true;
      clearUpdateWatchdog();

      sendUpdaterStatus("error", { message });
      updaterWindow?.close();
      notifyMainWindowUpdateFailed(message);
      flushPendingDeepLinks();
    };

    autoUpdater.on("update-downloaded", () => {
      const startedWithoutUpdate = updateFlowSettled;
      updateFlowSettled = true;
      clearUpdateWatchdog();
      if (startedWithoutUpdate) return;

      isUpdateInstallPending = true;
      sendUpdaterStatus("downloaded");
      setTimeout(() => autoUpdater.quitAndInstall(), 700);
    });

    autoUpdater.on("update-not-available", continueWithoutUpdate);

    autoUpdater.on("error", (error) => {
      if (switchToMirrorFeed()) return;
      continueWithFailedUpdate(error.message);
    });

    let updateCheckStarted = false;
    const checkForUpdates = () => {
      if (updateFlowSettled || updateCheckStarted) return;
      updateCheckStarted = true;

      sendUpdaterStatus("checking");
      void autoUpdater
        .checkForUpdates()
        .then((result) => {
          if (!result) continueWithoutUpdate();
        })
        .catch((error) => {
          if (mirrorFeedTried) return;
          if (switchToMirrorFeed()) return;
          continueWithFailedUpdate(
            error instanceof Error ? error.message : String(error),
          );
        });
    };

    function switchToMirrorFeed(): boolean {
      if (updateFlowSettled || mirrorFeedTried) return false;
      mirrorFeedTried = true;

      try {
        autoUpdater.setFeedURL({
          provider: "generic",
          url: UPDATE_MIRROR_URL,
          channel: "latest",
        });
      } catch (error) {
        console.error("[Updater] Could not switch to the mirror feed:", error);
        return false;
      }

      console.warn("[Updater] GitHub feed failed, retrying from the mirror.");
      updateCheckStarted = false;
      markUpdateActivity(UPDATE_CHECK_TIMEOUT_MS);
      checkForUpdates();
      return true;
    }

    updateWatchdog = setInterval(() => {
      if (updateFlowSettled) {
        clearUpdateWatchdog();
        return;
      }
      if (Date.now() - updateActivityAt < updateStallLimitMs) return;

      console.warn("[Updater] Timed out, starting without update.");
      continueWithoutUpdate();
    }, UPDATE_WATCHDOG_TICK_MS);

    const updaterContents = updaterWindow?.webContents;
    if (updaterContents?.isLoading()) {
      updaterContents.once("did-finish-load", checkForUpdates);
      updaterContents.once("did-fail-load", (_event, code, description) => {
        console.error(`[Updater] Splash failed to load: ${code} ${description}`);
        checkForUpdates();
      });
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

    appShutdownTimeout = setTimeout(
      () => {
        console.warn("[Shutdown] Cleanup timed out, forcing app exit.");
        app.exit(0);
      },
      hasRunningServers()
        ? APP_SERVER_SHUTDOWN_TIMEOUT_MS
        : isUpdateInstallPending
          ? APP_UPDATE_SHUTDOWN_TIMEOUT_MS
          : APP_SHUTDOWN_TIMEOUT_MS,
    );

    disposePushToTalk();

    void Promise.allSettled([
      stopServersForShutdown(),
      lanShareService.dispose(),
      rpc.dispose(),
      stopOAuthServer("Application shutdown."),
      ...[...gameRuntime.processes.values()].map((record) =>
        endSession(record.versionName, record.instance, 0, {
          recovered: true,
        }),
      ),
    ]).finally(() => {
      if (appShutdownTimeout) {
        clearTimeout(appShutdownTimeout);
        appShutdownTimeout = null;
      }

      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (isLegacyLocalStorageDumpRunning()) return;

    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
