import fs from "fs-extra";
import path from "path";
import { normalizeSettings, type GameWindowMode } from "@/types/Settings";
import { hideMainWindowToTray, mainWindow } from "../windows/mainWindow";
import { getDataRoot } from "./dataRoot";

type GameWindowPolicy = { mode: GameWindowMode; restore: boolean };

let hiddenForGame = false;

function readPolicy(): GameWindowPolicy {
  try {
    const raw = fs.readJSONSync(path.join(getDataRoot(), "settings.json"), {
      throws: false,
    });
    const settings = normalizeSettings(raw);
    return { mode: settings.gameWindow, restore: settings.restoreAfterGame };
  } catch {
    return { mode: "minimize", restore: true };
  }
}

export function hideWindowForGame(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
    return;
  }

  const { mode } = readPolicy();
  if (mode === "keep") return;

  try {
    if (mode === "tray" && hideMainWindowToTray()) {
      hiddenForGame = true;
      return;
    }
    mainWindow.minimize();
  } catch {}
}

export function returnWindowAfterGame(options: { force?: boolean } = {}): void {
  const wasHidden = hiddenForGame;
  hiddenForGame = false;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!options.force && !readPolicy().restore) return;

  try {
    if (wasHidden && !mainWindow.isVisible()) {
      mainWindow.show();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
  } catch {}
}
