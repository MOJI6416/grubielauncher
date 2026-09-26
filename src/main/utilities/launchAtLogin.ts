import os from "os";
import path from "path";
import fs from "fs-extra";
import { app } from "electron";

export const HIDDEN_START_FLAG = "--hidden";

const AUTOSTART_FILE = "grubie-launcher.desktop";
const HIDDEN_RELAUNCH_FILE = "start-hidden.flag";

export interface LaunchAtLoginState {
  supported: boolean;
  enabled: boolean;
}

function linuxExecutable(): string | null {
  return process.env["APPIMAGE"] || (app.isPackaged ? process.execPath : null);
}

function autostartPath(): string {
  const configHome =
    process.env["XDG_CONFIG_HOME"] || path.join(os.homedir(), ".config");
  return path.join(configHome, "autostart", AUTOSTART_FILE);
}

export function linuxAutostartEntry(executable: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Grubie Launcher",
    `Exec="${executable.replace(/"/g, '\\"')}" ${HIDDEN_START_FLAG}`,
    "Icon=grubie-launcher",
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

function isSupported(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === "linux") return linuxExecutable() !== null;
  return process.platform === "win32" || process.platform === "darwin";
}

export async function getLaunchAtLogin(): Promise<LaunchAtLoginState> {
  if (!isSupported()) return { supported: false, enabled: false };

  if (process.platform === "linux") {
    return { supported: true, enabled: await fs.pathExists(autostartPath()) };
  }

  const settings = app.getLoginItemSettings({ args: [HIDDEN_START_FLAG] });
  return { supported: true, enabled: settings.openAtLogin };
}

export async function setLaunchAtLogin(
  enabled: boolean,
): Promise<LaunchAtLoginState> {
  if (!isSupported()) return { supported: false, enabled: false };

  if (process.platform === "linux") {
    const executable = linuxExecutable();
    if (enabled && executable) {
      await fs.outputFile(autostartPath(), linuxAutostartEntry(executable));
    } else {
      await fs.remove(autostartPath());
    }
    return getLaunchAtLogin();
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: enabled,
    args: [HIDDEN_START_FLAG],
  });
  return getLaunchAtLogin();
}

function hiddenRelaunchPath(): string {
  return path.join(app.getPath("userData"), HIDDEN_RELAUNCH_FILE);
}

export function markHiddenRelaunch(): void {
  try {
    fs.outputFileSync(hiddenRelaunchPath(), String(Date.now()));
  } catch {}
}

export function consumeHiddenStart(argv: string[]): boolean {
  let relaunch = false;
  try {
    relaunch = fs.pathExistsSync(hiddenRelaunchPath());
    if (relaunch) fs.removeSync(hiddenRelaunchPath());
  } catch {
    relaunch = false;
  }

  const openedAsHidden =
    process.platform === "darwin" &&
    app.getLoginItemSettings().wasOpenedAsHidden === true;

  return relaunch || openedAsHidden || argv.includes(HIDDEN_START_FLAG);
}
