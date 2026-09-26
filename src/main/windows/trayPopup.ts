import path from "path";
import { is } from "@electron-toolkit/utils";
import { BrowserWindow, Rectangle, screen } from "electron";
import { TRAY_POPUP_WIDTH, TrayModel } from "@/types/Tray";
import {
  placeTrayPopup,
  resolveTrayAnchor,
  type Point,
} from "./trayPopupPlacement";

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 640;
const REVEAL_FALLBACK_MS = 1200;
const BLUR_GRACE_MS = 250;

let popup: BrowserWindow | null = null;
let anchor: Point | null = null;
let height = 360;
let latestModel: TrayModel | null = null;
let shownAt = 0;
let revealTimer: NodeJS.Timeout | null = null;

function isAlive(window: BrowserWindow | null): window is BrowserWindow {
  return !!window && !window.isDestroyed();
}

function clearRevealTimer(): void {
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = null;
}

function reposition(): void {
  if (!isAlive(popup)) return;

  const point = anchor ?? screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const { x, y } = placeTrayPopup(point, display, {
    width: TRAY_POPUP_WIDTH,
    height,
  });

  popup.setBounds({ x, y, width: TRAY_POPUP_WIDTH, height });
}

function create(): BrowserWindow {
  const window = new BrowserWindow({
    width: TRAY_POPUP_WIDTH,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      devTools: is.dev,
      webSecurity: is.dev ? false : true,
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  window.setAlwaysOnTop(true, "pop-up-menu");
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("blur", () => {
    if (Date.now() - shownAt < BLUR_GRACE_MS) {
      window.focus();
      return;
    }
    hideTrayPopup();
  });
  window.on("closed", () => {
    clearRevealTimer();
    popup = null;
  });
  window.webContents.on("did-finish-load", () => {
    if (latestModel) window.webContents.send("trayPopup:model", latestModel);
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/tray`);
  } else {
    void window.loadURL("app://bundle/tray.html");
  }

  return window;
}

export function prewarmTrayPopup(): void {
  if (!isAlive(popup)) popup = create();
}

export function showTrayPopup(icon: Rectangle | null): void {
  anchor = resolveTrayAnchor(screen.getCursorScreenPoint(), icon);
  if (!isAlive(popup)) popup = create();

  reposition();
  shownAt = Date.now();
  popup.setOpacity(0);
  popup.show();
  popup.focus();

  const contents = popup.webContents;
  if (!contents.isLoading()) contents.send("trayPopup:shown");

  clearRevealTimer();
  revealTimer = setTimeout(revealTrayPopup, REVEAL_FALLBACK_MS);
}

export function revealTrayPopup(): void {
  clearRevealTimer();
  if (!isAlive(popup) || !popup.isVisible()) return;
  popup.setOpacity(1);
}

export function toggleTrayPopup(icon: Rectangle | null): void {
  if (isAlive(popup) && popup.isVisible()) {
    hideTrayPopup();
    return;
  }
  showTrayPopup(icon);
}

export function hideTrayPopup(): void {
  clearRevealTimer();
  if (!isAlive(popup) || !popup.isVisible()) return;
  popup.setOpacity(0);
  popup.hide();
}

export function resizeTrayPopup(next: number): void {
  const clamped = Math.round(Math.min(Math.max(next, MIN_HEIGHT), MAX_HEIGHT));
  if (clamped === height) return;
  height = clamped;
  reposition();
}

export function sendModelToTrayPopup(model: TrayModel): void {
  latestModel = model;
  const contents = popup?.webContents;
  if (!contents || contents.isDestroyed() || contents.isLoading()) return;
  contents.send("trayPopup:model", model);
}

export function getTrayPopupModel(): TrayModel | null {
  return latestModel;
}

export function destroyTrayPopup(): void {
  clearRevealTimer();
  if (isAlive(popup)) popup.destroy();
  popup = null;
}
