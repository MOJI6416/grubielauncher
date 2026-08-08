import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs-extra";
import path from "path";

const PENDING_FILE = "app-origin-localstorage.json";
const DONE_FILE = "app-origin-localstorage.done";
const PROBE_FILE = "legacy-origin-probe.html";
const PROBE_TIMEOUT_MS = 5000;

let dumpRunning = false;
let migrationSettled = false;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error("Legacy localStorage probe timed out")),
        timeoutMs,
      ),
    ),
  ]);
}

export function isLegacyLocalStorageDumpRunning(): boolean {
  return dumpRunning;
}

function getPendingPath() {
  return path.join(app.getPath("userData"), PENDING_FILE);
}

function getDonePath() {
  return path.join(app.getPath("userData"), DONE_FILE);
}

export async function prepareLegacyLocalStorageDump(): Promise<void> {
  const pendingPath = getPendingPath();
  const donePath = getDonePath();

  if (await fs.pathExists(donePath)) return;
  if (await fs.pathExists(pendingPath)) return;

  const probePath = path.join(app.getPath("userData"), PROBE_FILE);
  let probeWindow: BrowserWindow | null = null;

  dumpRunning = true;
  try {
    await fs.writeFile(probePath, "<!doctype html><title>migration</title>");

    probeWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        devTools: false,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    await withTimeout(probeWindow.loadFile(probePath), PROBE_TIMEOUT_MS);

    const raw: unknown = await withTimeout(
      probeWindow.webContents.executeJavaScript("JSON.stringify(localStorage)"),
      PROBE_TIMEOUT_MS,
    );
    const dump = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<
      string,
      string
    >;

    if (Object.keys(dump).length > 0) {
      await fs.writeJSON(pendingPath, dump);
    } else {
      await fs.writeFile(donePath, "");
    }
  } catch {
    await fs.writeFile(donePath, "").catch(() => {});
  } finally {
    probeWindow?.destroy();
    setTimeout(() => {
      dumpRunning = false;
    }, 1000);
    await fs.remove(probePath).catch(() => {});
  }
}

export function registerLegacyLocalStorageIpc(): void {
  ipcMain.on("migration:legacyLocalStorage", (event) => {
    if (migrationSettled) {
      event.returnValue = null;
      return;
    }

    try {
      const pendingPath = getPendingPath();
      if (!fs.pathExistsSync(pendingPath)) {
        migrationSettled = true;
        event.returnValue = null;
        return;
      }

      const dump = fs.readJSONSync(pendingPath) as Record<string, string>;
      fs.writeFileSync(getDonePath(), "");
      fs.removeSync(pendingPath);
      migrationSettled = true;
      event.returnValue = dump;
    } catch {
      migrationSettled = true;
      event.returnValue = null;
    }
  });
}
