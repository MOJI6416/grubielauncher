import { is } from "@electron-toolkit/utils";
import { BrowserWindow } from "electron";
import path from "path";

export let updaterWindow: BrowserWindow | null = null;

export function createUpdaterWindow() {
  updaterWindow = new BrowserWindow({
    width: 280,
    height: 190,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
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

  updaterWindow.on("closed", () => {
    updaterWindow = null;
  });

  updaterWindow.once("ready-to-show", () => {
    updaterWindow?.show();
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    updaterWindow.loadURL(process.env["ELECTRON_RENDERER_URL"] + "/updater");
  } else {
    updaterWindow.loadURL("app://bundle/updater.html");
  }
}
