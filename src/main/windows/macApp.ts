import path from "path";
import fs from "fs-extra";
import { app, dialog, Menu, MenuItemConstructorOptions } from "electron";
import { matchLanguage } from "@/types/Settings";
import { getLauncherPaths } from "../utilities/other";
import { getSystemLocale } from "../utilities/systemLocale";
import { mainWindow, requestAppQuit, revealMainWindow } from "./mainWindow";
import locales from "./macLocales.json";

type MacLabels = (typeof locales)["en"];
type MenuLabels = MacLabels["menu"];

const MOVE_DECLINED_FILE = "move-to-applications-declined";

let currentLang: string | null = null;

function savedLanguage(): string | null {
  try {
    const settings = fs.readJSONSync(
      path.join(getLauncherPaths().launcher, "settings.json"),
      { throws: false },
    );
    return typeof settings?.lang === "string"
      ? matchLanguage(settings.lang)
      : null;
  } catch {
    return null;
  }
}

function resolveLanguage(lang?: string | null): string {
  return (
    (lang ? matchLanguage(lang) : null) ??
    currentLang ??
    savedLanguage() ??
    matchLanguage(getSystemLocale()) ??
    "en"
  );
}

function labelsFor(lang: string): MacLabels {
  return (locales as Record<string, MacLabels>)[lang] ?? locales.en;
}

function withAppName(template: string): string {
  return template.replace("{{app}}", app.name);
}

function openSettings(): void {
  revealMainWindow();
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("tray:action", { type: "openSettings" });
}

function buildTemplate(labels: MenuLabels): MenuItemConstructorOptions[] {
  return [
    {
      label: app.name,
      submenu: [
        { role: "about", label: withAppName(labels.about) },
        { type: "separator" },
        {
          label: labels.settings,
          accelerator: "Command+,",
          click: openSettings,
        },
        { type: "separator" },
        { role: "services", label: labels.services },
        { type: "separator" },
        { role: "hide", label: withAppName(labels.hide) },
        { role: "hideOthers", label: labels.hideOthers },
        { role: "unhide", label: labels.showAll },
        { type: "separator" },
        {
          label: withAppName(labels.quit),
          accelerator: "Command+Q",
          click: requestAppQuit,
        },
      ],
    },
    {
      label: labels.edit,
      submenu: [
        { role: "undo", label: labels.undo },
        { role: "redo", label: labels.redo },
        { type: "separator" },
        { role: "cut", label: labels.cut },
        { role: "copy", label: labels.copy },
        { role: "paste", label: labels.paste },
        { role: "delete", label: labels.delete },
        { role: "selectAll", label: labels.selectAll },
      ],
    },
    {
      label: labels.view,
      submenu: [{ role: "togglefullscreen", label: labels.fullScreen }],
    },
    {
      role: "window",
      label: labels.window,
      submenu: [
        { role: "minimize", label: labels.minimize },
        { role: "zoom", label: labels.zoom },
        { type: "separator" },
        { role: "front", label: labels.front },
        { type: "separator" },
        { role: "close", label: labels.close },
      ],
    },
  ];
}

export function installAppMenu(lang?: string | null): void {
  if (process.platform !== "darwin") return;

  const next = resolveLanguage(lang);
  if (next === currentLang && Menu.getApplicationMenu()) return;

  currentLang = next;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildTemplate(labelsFor(next).menu)),
  );
}

function moveDeclinedPath(): string {
  return path.join(app.getPath("userData"), MOVE_DECLINED_FILE);
}

export async function offerMoveToApplications(): Promise<boolean> {
  if (process.platform !== "darwin" || !app.isPackaged) return false;
  if (app.isInApplicationsFolder()) return false;
  if (await fs.pathExists(moveDeclinedPath())) return false;

  const labels = labelsFor(resolveLanguage()).move;
  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: "question",
    message: labels.message,
    detail: labels.detail,
    buttons: [labels.confirm, labels.cancel],
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: labels.remember,
  });

  if (response !== 0) {
    if (checkboxChecked) {
      await fs.outputFile(moveDeclinedPath(), "").catch(() => {});
    }
    return false;
  }

  try {
    return app.moveToApplicationsFolder();
  } catch (error) {
    console.error("[mac] could not move the app to Applications:", error);
    return false;
  }
}
