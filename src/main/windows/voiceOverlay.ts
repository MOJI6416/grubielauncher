import { BrowserWindow, screen } from "electron";
import path from "path";
import { is } from "@electron-toolkit/utils";
import {
  HIDDEN_VOICE_OVERLAY,
  OVERLAY_CORNERS,
  type OverlayCorner,
  type OverlayDisplay,
  type VoiceOverlaySpeaker,
  type VoiceOverlayState,
} from "@/types/Voice";
import { appPageUrl } from "./appPages";

const OVERLAY_WIDTH = 260;
const OVERLAY_HEIGHT = 300;
const OVERLAY_MARGIN = 16;
const MAX_SPEAKERS = 8;
const MAX_TEXT = 64;
const MAX_URL = 1024;

let overlay: BrowserWindow | null = null;
let isShown = false;
let latest: VoiceOverlayState = HIDDEN_VOICE_OVERLAY;
let placedAt = "";

type Area = { x: number; y: number; width: number; height: number };

export function overlayBounds(area: Area, corner: OverlayCorner): Area {
  const right = corner.endsWith("right");
  const bottom = corner.startsWith("bottom");
  return {
    x: right
      ? area.x + area.width - OVERLAY_WIDTH - OVERLAY_MARGIN
      : area.x + OVERLAY_MARGIN,
    y: bottom
      ? area.y + area.height - OVERLAY_HEIGHT - OVERLAY_MARGIN
      : area.y + OVERLAY_MARGIN,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
  };
}

export function listOverlayDisplays(): OverlayDisplay[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    label: display.label || "",
    primary: display.id === primaryId,
    width: display.size.width,
    height: display.size.height,
  }));
}

function isAlive(window: BrowserWindow | null): window is BrowserWindow {
  return !!window && !window.isDestroyed();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : "";
}

function headUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_URL) return null;
  return /^https?:\/\//i.test(value) ? value : null;
}

export function normalizeOverlayState(value: unknown): VoiceOverlayState {
  if (!value || typeof value !== "object") return HIDDEN_VOICE_OVERLAY;
  const source = value as { visible?: unknown; speakers?: unknown };
  if (source.visible !== true) return HIDDEN_VOICE_OVERLAY;

  const speakers: VoiceOverlaySpeaker[] = Array.isArray(source.speakers)
    ? source.speakers.slice(0, MAX_SPEAKERS).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const speaker = entry as Record<string, unknown>;
        const id = text(speaker.id);
        if (!id) return [];
        return [
          {
            id,
            name: text(speaker.name),
            initials: text(speaker.initials).slice(0, 2),
            headUrl: headUrl(speaker.headUrl),
            isLocal: speaker.isLocal === true,
          },
        ];
      })
    : [];

  const raw = value as { corner?: unknown; displayId?: unknown };
  const corner = OVERLAY_CORNERS.includes(raw.corner as OverlayCorner)
    ? (raw.corner as OverlayCorner)
    : undefined;
  const displayId = Number.isSafeInteger(raw.displayId)
    ? Number(raw.displayId)
    : undefined;

  return { visible: true, speakers, corner, displayId };
}

function placementKey(state: VoiceOverlayState): string {
  return `${state.corner ?? "top-left"}:${state.displayId ?? 0}`;
}

function place(window: BrowserWindow) {
  const display =
    screen.getAllDisplays().find((item) => item.id === latest.displayId) ??
    screen.getPrimaryDisplay();
  window.setBounds(overlayBounds(display.workArea, latest.corner ?? "top-left"));
  placedAt = placementKey(latest);
}

function create(): BrowserWindow {
  const window = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
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
      backgroundThrottling: false,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin") {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  window.setIgnoreMouseEvents(true);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("did-finish-load", () => {
    window.webContents.send("voiceOverlay:state", latest);
  });
  window.on("closed", () => {
    overlay = null;
    isShown = false;
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/overlay`);
  } else {
    void window.loadURL(appPageUrl("overlay", "overlay.html"));
  }

  return window;
}

export function updateVoiceOverlay(value: unknown): void {
  latest = normalizeOverlayState(value);

  if (!latest.visible) {
    if (isAlive(overlay)) overlay.hide();
    isShown = false;
    return;
  }

  if (!isAlive(overlay)) {
    overlay = create();
    isShown = false;
  }
  if (!overlay.webContents.isLoading()) {
    overlay.webContents.send("voiceOverlay:state", latest);
  }
  if (!isShown) {
    place(overlay);
    overlay.showInactive();
    isShown = true;
  } else if (placedAt !== placementKey(latest)) {
    place(overlay);
  }
}

export function destroyVoiceOverlay(): void {
  if (isAlive(overlay)) overlay.destroy();
  overlay = null;
  isShown = false;
}
