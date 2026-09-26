import path from "path";
import fs from "fs-extra";
import {
  app,
  Menu,
  MenuItemConstructorOptions,
  nativeImage,
  Notification,
  Tray,
} from "electron";
import icon from "../../../resources/icon.png?asset";
import { resolveCloseToTray } from "@/types/Settings";
import { TrayModel } from "@/types/Tray";
import { getLauncherPaths } from "../utilities/other";
import { installDownloadedUpdate } from "../utilities/backgroundUpdates";
import {
  destroyTrayPopup,
  hideTrayPopup,
  prewarmTrayPopup,
  sendModelToTrayPopup,
  toggleTrayPopup,
} from "../windows/trayPopup";
import {
  mainWindow,
  requestAppQuit,
  revealMainWindow,
  setHideToTrayHandler,
} from "../windows/mainWindow";
import {
  buildTrayMenu,
  buildTrayTooltip,
  TrayCommand,
  TrayMenuEntry,
} from "./trayMenu";

const USES_POPUP = process.platform !== "linux";
const KEEPS_POPUP_OPEN = new Set<TrayCommand["type"]>(["toggleMute", "toggleDeafen"]);

const APP_NAME = "Grubie Launcher";
const STATE_FILE = "tray-state.json";

const FALLBACK_LABELS: Record<string, { open: string; quit: string }> = {
  en: { open: "Open Grubie Launcher", quit: "Quit" },
  ru: { open: "Открыть Grubie Launcher", quit: "Выйти" },
  uk: { open: "Відкрити Grubie Launcher", quit: "Вийти" },
};

let tray: Tray | null = null;
let model: TrayModel | null = null;
let closeToTray = false;
let hintShown = false;

function statePath(): string {
  return path.join(getLauncherPaths().launcher, STATE_FILE);
}

function readInitialState(): void {
  try {
    const settings = fs.readJSONSync(
      path.join(getLauncherPaths().launcher, "settings.json"),
      { throws: false },
    );
    closeToTray = resolveCloseToTray(settings?.closeToTray, process.platform);
  } catch {
    closeToTray = resolveCloseToTray(null, process.platform);
  }

  try {
    hintShown = fs.readJSONSync(statePath(), { throws: false })?.hintShown === true;
  } catch {
    hintShown = false;
  }
}

function trayIcon(): Electron.NativeImage {
  const base = nativeImage.createFromPath(icon);
  if (base.isEmpty()) return base;
  if (process.platform === "darwin") {
    return base.resize({ width: 16, height: 16, quality: "best" });
  }

  const image = nativeImage.createEmpty();
  for (const [scaleFactor, size] of [
    [1, 16],
    [1.5, 24],
    [2, 32],
  ] as const) {
    const rendition = base.resize({ width: size, height: size, quality: "best" });
    image.addRepresentation({
      scaleFactor,
      width: size,
      height: size,
      buffer: rendition.toPNG(),
    });
  }
  return image;
}

export function runTrayCommand(command: TrayCommand): void {
  if (!KEEPS_POPUP_OPEN.has(command.type)) hideTrayPopup();

  if (command.type === "open") {
    revealMainWindow();
    return;
  }
  if (command.type === "quit") {
    requestAppQuit();
    return;
  }
  if (command.type === "installUpdate") {
    void installDownloadedUpdate();
    return;
  }

  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("tray:action", command);
}

function toTemplate(entries: TrayMenuEntry[]): MenuItemConstructorOptions[] {
  return entries.map((entry) => {
    switch (entry.kind) {
      case "separator":
        return { type: "separator" };
      case "label":
        return { label: entry.label, enabled: false };
      case "check":
        return {
          type: "checkbox",
          label: entry.label,
          checked: entry.checked,
          click: () => runTrayCommand(entry.command),
        };
      case "submenu":
        return { label: entry.label, submenu: toTemplate(entry.items) };
      default:
        return {
          label: entry.label,
          enabled: entry.enabled !== false,
          click: () => runTrayCommand(entry.command),
        };
    }
  });
}

function fallbackMenu(): TrayMenuEntry[] {
  const locale = app.getLocale().slice(0, 2);
  const labels = FALLBACK_LABELS[locale] ?? FALLBACK_LABELS.en;
  return [
    { kind: "item", label: labels.open, command: { type: "open" } },
    { kind: "separator" },
    { kind: "item", label: labels.quit, command: { type: "quit" } },
  ];
}

function render(): void {
  if (!tray || tray.isDestroyed()) return;

  tray.setToolTip(buildTrayTooltip(model, APP_NAME));
  if (USES_POPUP) return;

  tray.setContextMenu(
    Menu.buildFromTemplate(toTemplate(model ? buildTrayMenu(model) : fallbackMenu())),
  );
}

function applyThrottling(): void {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;

  const keepAwake = Boolean(model?.voice || model?.incomingCall);
  contents.setBackgroundThrottling(!keepAwake);
}

function showHintOnce(): void {
  if (hintShown || !Notification.isSupported() || !model) return;
  hintShown = true;

  void fs
    .outputJSON(statePath(), { hintShown: true })
    .catch(() => undefined);

  const notification = new Notification({
    title: model.labels.hintTitle || APP_NAME,
    body: model.labels.hintBody,
    icon,
    silent: true,
  });
  notification.on("click", revealMainWindow);
  notification.show();
}

function hideToTray(): boolean {
  if (!tray || tray.isDestroyed() || !closeToTray) return false;
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  mainWindow.hide();
  applyThrottling();
  showHintOnce();
  return true;
}

export function initTray(): void {
  if (tray) return;

  readInitialState();

  try {
    tray = new Tray(trayIcon());
  } catch (error) {
    console.error("[Tray] could not create the tray icon:", error);
    tray = null;
    return;
  }

  tray.on("click", () => {
    hideTrayPopup();
    revealMainWindow();
  });
  tray.on("double-click", revealMainWindow);
  if (USES_POPUP) {
    tray.on("mouse-enter", prewarmTrayPopup);
    tray.on("right-click", () => toggleTrayPopup(tray?.getBounds() ?? null));
  }
  setHideToTrayHandler(hideToTray);
  render();

  app.on("before-quit", () => {
    setHideToTrayHandler(null);
    destroyTrayPopup();
    tray?.destroy();
    tray = null;
  });
}

export function updateTray(next: TrayModel): void {
  model = next;
  closeToTray = next.closeToTray;
  render();
  applyThrottling();
  sendModelToTrayPopup(next);
}
