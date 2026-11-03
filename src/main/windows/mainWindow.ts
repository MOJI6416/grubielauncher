import { app, BrowserWindow, screen, shell } from "electron";
import { join } from "path";
import icon from "../../../resources/icon.png?asset";
import { rpc } from "../rpc";
import { is } from "@electron-toolkit/utils";
import fs from "fs-extra";
import { writeJsonAtomicSync } from "../utilities/atomicJson";
import { getDataRoot } from "../utilities/dataRoot";
import { TITLEBAR_OVERLAY } from "@/shared/titlebar";
import {
  DEFAULT_UI_SCALE,
  fitUiScale,
  normalizeUiScale,
  scaledSize,
  UI_SCALES,
  uiScaleOptions,
  type UiScaleState,
} from "@/shared/uiScale";

export let mainWindow: BrowserWindow | null = null;

const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;
const BASE_SIZE = { width: MIN_WIDTH, height: MIN_HEIGHT };

const AUTO_OPEN_HOST_SUFFIXES = [
  "grubielauncher.com",
  "modrinth.com",
  "curseforge.com",
  "github.com",
  "discord.com",
  "discord.gg",
  "minecraft.net",
  "mojang.com",
  "ely.by",
  "fabricmc.net",
  "neoforged.net",
  "minecraftforge.net",
  "quiltmc.org",
];

function openIfTrusted(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;

    const host = parsed.hostname.toLowerCase();
    const trusted = AUTO_OPEN_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
    if (!trusted) {
      console.warn(`[Navigation] blocked auto-open for ${host}`);
      return;
    }

    void shell.openExternal(parsed.toString());
  } catch {}
}

let mainWindowCreated = false;
let pendingShow = true;
let isReadyToShow = false;
let shouldMaximizeOnShow = false;
let hasUnsavedChanges = false;
let isCloseConfirmed = false;
let runningServersProbe: (() => boolean) | null = null;
let installActiveProbe: (() => boolean) | null = null;
let hideToTrayHandler: (() => boolean) | null = null;
let trayHider: (() => boolean) | null = null;
let requestedUiScale = DEFAULT_UI_SCALE;
let appliedUiScale = DEFAULT_UI_SCALE;
let isDisplayWatchInstalled = false;

export function setHideToTrayHandler(handler: (() => boolean) | null): void {
  hideToTrayHandler = handler;
}

export function setTrayHider(hider: (() => boolean) | null): void {
  trayHider = hider;
}

export function hideMainWindowToTray(): boolean {
  return probe(trayHider);
}

export function setUnsavedChangesGuard(value: boolean): void {
  hasUnsavedChanges = value;
}

export function setRunningServersProbe(probe: () => boolean): void {
  runningServersProbe = probe;
}

export function setInstallActiveProbe(probe: () => boolean): void {
  installActiveProbe = probe;
}

export function confirmWindowClose(): void {
  isCloseConfirmed = true;
  hasUnsavedChanges = false;
  mainWindow?.close();
}

app.on("before-quit", () => {
  isCloseConfirmed = true;
});

interface CloseReasons {
  unsaved: boolean;
  servers: boolean;
  install: boolean;
}

function probe(check: (() => boolean) | null): boolean {
  try {
    return check?.() === true;
  } catch {
    return false;
  }
}

function pendingCloseReasons(): CloseReasons | null {
  const reasons = {
    unsaved: hasUnsavedChanges,
    servers: probe(runningServersProbe),
    install: probe(installActiveProbe),
  };
  return reasons.unsaved || reasons.servers || reasons.install
    ? reasons
    : null;
}

function askBeforeClosing(reasons: CloseReasons): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.webContents.send("app:closeRequested", reasons);
  revealMainWindow();
}

export function revealMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  showMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

export function requestAppQuit(): void {
  const reasons = pendingCloseReasons();
  if (reasons && !isCloseConfirmed && mainWindow && !mainWindow.isDestroyed()) {
    askBeforeClosing(reasons);
    return;
  }

  app.quit();
}

function presentMainWindow(): void {
  if (!mainWindow) return;

  mainWindow.show();
  if (shouldMaximizeOnShow) {
    shouldMaximizeOnShow = false;
    mainWindow.maximize();
  }
}

export function showMainWindow(): void {
  pendingShow = true;
  if (isReadyToShow) presentMainWindow();
}

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

function getWindowStatePath(): string {
  return join(getDataRoot(), "window-state.json");
}

function readWindowState(): WindowState | null {
  try {
    const state = fs.readJSONSync(getWindowStatePath()) as Partial<WindowState>;
    if (typeof state?.width !== "number" || typeof state?.height !== "number") {
      return null;
    }

    const floor = scaledSize(UI_SCALES[0], BASE_SIZE);
    let width = Math.max(floor.width, Math.round(state.width));
    let height = Math.max(floor.height, Math.round(state.height));

    let x: number | undefined;
    let y: number | undefined;
    if (typeof state.x === "number" && typeof state.y === "number") {
      const visible = screen.getAllDisplays().some((display) => {
        const area = display.workArea;
        return (
          state.x! < area.x + area.width &&
          state.x! + width > area.x &&
          state.y! < area.y + area.height &&
          state.y! + height > area.y
        );
      });
      if (visible) {
        x = Math.round(state.x);
        y = Math.round(state.y);
      }
    }

    const targetArea =
      x !== undefined && y !== undefined
        ? screen.getDisplayNearestPoint({ x, y }).workArea
        : screen.getPrimaryDisplay().workArea;
    width = Math.min(width, targetArea.width);
    height = Math.min(height, targetArea.height);

    return { width, height, x, y, isMaximized: state.isMaximized === true };
  } catch {
    return null;
  }
}

function saveWindowState(window: BrowserWindow): void {
  try {
    const bounds = window.getNormalBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: window.isMaximized(),
    };
    writeJsonAtomicSync(getWindowStatePath(), state);
  } catch {}
}

function readSavedUiScale(): number {
  try {
    const settings = fs.readJSONSync(join(getDataRoot(), "settings.json"), {
      throws: false,
    });
    return normalizeUiScale(settings?.uiScale);
  } catch {
    return DEFAULT_UI_SCALE;
  }
}

function windowWorkArea(window: BrowserWindow): Electron.Rectangle {
  return screen.getDisplayMatching(window.getBounds()).workArea;
}

function titleBarOverlayFor(scale: number) {
  return {
    ...TITLEBAR_OVERLAY,
    height: Math.round(TITLEBAR_OVERLAY.height * scale),
  };
}

function keepInsideWorkArea(window: BrowserWindow): void {
  const area = windowWorkArea(window);
  const bounds = window.getBounds();
  const x = Math.min(
    Math.max(bounds.x, area.x),
    area.x + Math.max(0, area.width - bounds.width),
  );
  const y = Math.min(
    Math.max(bounds.y, area.y),
    area.y + Math.max(0, area.height - bounds.height),
  );
  if (x !== bounds.x || y !== bounds.y) window.setPosition(x, y);
}

function applyUiScale(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const window = mainWindow;
  const effective = fitUiScale(
    requestedUiScale,
    windowWorkArea(window),
    BASE_SIZE,
  );
  const min = scaledSize(effective, BASE_SIZE);

  window.setMinimumSize(min.width, min.height);
  if (!window.isMaximized() && !window.isFullScreen()) {
    const [width, height] = window.getSize();
    if (width < min.width || height < min.height) {
      window.setSize(Math.max(width, min.width), Math.max(height, min.height));
      keepInsideWorkArea(window);
    }
  }

  if (process.platform === "win32") {
    window.setTitleBarOverlay(titleBarOverlayFor(effective));
  }
  window.webContents.setZoomFactor(effective);
  appliedUiScale = effective;
}

function watchDisplays(): void {
  if (isDisplayWatchInstalled) return;
  isDisplayWatchInstalled = true;

  const refit = () => applyUiScale();
  screen.on("display-metrics-changed", refit);
  screen.on("display-added", refit);
  screen.on("display-removed", refit);
}

export function setUiScale(scale: number): UiScaleState {
  requestedUiScale = normalizeUiScale(scale);
  applyUiScale();
  return getUiScaleState();
}

export function getUiScaleState(): UiScaleState {
  const area =
    mainWindow && !mainWindow.isDestroyed()
      ? windowWorkArea(mainWindow)
      : screen.getPrimaryDisplay().workArea;

  return {
    scale: requestedUiScale,
    effective: appliedUiScale,
    options: uiScaleOptions(area, BASE_SIZE),
  };
}

export function wasMainWindowCreated(): boolean {
  return mainWindowCreated;
}

export function createMainWindow(options: { deferShow?: boolean } = {}): void {
  const savedState = readWindowState();
  mainWindowCreated = true;

  requestedUiScale = readSavedUiScale();
  const targetArea =
    savedState?.x !== undefined && savedState?.y !== undefined
      ? screen.getDisplayNearestPoint({ x: savedState.x, y: savedState.y })
          .workArea
      : screen.getPrimaryDisplay().workArea;
  appliedUiScale = fitUiScale(requestedUiScale, targetArea, BASE_SIZE);
  const minSize = scaledSize(appliedUiScale, BASE_SIZE);

  pendingShow = !options.deferShow;
  isReadyToShow = false;
  shouldMaximizeOnShow = savedState?.isMaximized === true;

  mainWindow = new BrowserWindow({
    minHeight: minSize.height,
    minWidth: minSize.width,
    width: Math.max(savedState?.width ?? 0, minSize.width),
    height: Math.max(savedState?.height ?? 0, minSize.height),
    ...(savedState?.x !== undefined && savedState?.y !== undefined
      ? { x: savedState.x, y: savedState.y }
      : {}),
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    resizable: true,
    ...(process.platform === "linux" ? { icon } : {}),
    ...(process.platform === "win32"
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: titleBarOverlayFor(appliedUiScale),
        }
      : {}),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: { height: TITLEBAR_OVERLAY.height },
          backgroundColor: TITLEBAR_OVERLAY.color,
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      devTools: is.dev,
      webSecurity: is.dev ? false : true,
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true,
      spellcheck: false,
      v8CacheOptions: "bypassHeatCheck",
      zoomFactor: appliedUiScale,
    },
  });

  watchDisplays();
  mainWindow.on("moved", applyUiScale);
  mainWindow.webContents.on("did-finish-load", applyUiScale);

  mainWindow.on("close", (event) => {
    if (!isCloseConfirmed && mainWindow && !mainWindow.isDestroyed()) {
      if (hideToTrayHandler?.() === true) {
        event.preventDefault();
        saveWindowState(mainWindow);
        return;
      }

      const reasons = pendingCloseReasons();
      if (reasons) {
        event.preventDefault();
        askBeforeClosing(reasons);
        return;
      }
    }

    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("render-process-gone", () => {
    hasUnsavedChanges = false;
  });

  mainWindow.once("ready-to-show", () => {
    void rpc.login();
    isReadyToShow = true;
    if (pendingShow) presentMainWindow();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openIfTrusted(details.url);
    return { action: "deny" };
  });

  const blockExternalNavigation = (
    event: Electron.Event,
    url: string,
  ): void => {
    const devUrl = process.env["ELECTRON_RENDERER_URL"];
    const isAllowed =
      url.startsWith("app://bundle/") || (!!devUrl && url.startsWith(devUrl));
    if (isAllowed) return;

    event.preventDefault();
    openIfTrusted(url);
  };

  mainWindow.webContents.on("will-navigate", blockExternalNavigation);
  mainWindow.webContents.on("will-redirect", blockExternalNavigation);

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadURL("app://bundle/index.html");
  }
}
