import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { app } from "electron";
import { childProcessEnv } from "../utilities/childEnv";
import {
  findStreamingApp,
  parsePs,
  parseTasklist,
} from "../utilities/streamingApps";
import { mainWindow } from "../windows/mainWindow";

const POLL_MS = 15_000;
const FOCUS_RECHECK_MS = 3_000;

const run = promisify(execFile);

let watching = false;
let detected: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<string | null> | null = null;
let lastCheckAt = 0;
let focusHooked = false;

async function listProcesses(): Promise<string[]> {
  if (process.platform === "win32") {
    const tasklist = path.win32.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "tasklist.exe",
    );
    const { stdout } = await run(tasklist, ["/FO", "CSV", "/NH"], {
      windowsHide: true,
      timeout: 5000,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    return parseTasklist(stdout);
  }

  const { stdout } = await run("ps", ["-A", "-o", "comm="], {
    timeout: 5000,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    env: childProcessEnv(),
  });
  return parsePs(stdout);
}

function publish(next: string | null): void {
  if (next === detected) return;
  detected = next;
  const contents = mainWindow?.webContents;
  if (contents && !contents.isDestroyed()) {
    contents.send("streamer:detected", detected);
  }
}

function check(): Promise<string | null> {
  if (inflight) return inflight;

  inflight = listProcesses()
    .then((names) => findStreamingApp(names))
    .catch(() => detected)
    .then((found) => {
      lastCheckAt = Date.now();
      if (watching) publish(found);
      return detected;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!watching) return;
    void check().finally(() => {
      if (watching) schedule();
    });
  }, POLL_MS);
}

function hookFocus(): void {
  if (focusHooked) return;
  focusHooked = true;
  app.on("browser-window-focus", () => {
    if (!watching || Date.now() - lastCheckAt < FOCUS_RECHECK_MS) return;
    void check();
  });
}

export async function watchStreamingApps(
  enabled: boolean,
): Promise<string | null> {
  if (!enabled) {
    watching = false;
    if (timer) clearTimeout(timer);
    timer = null;
    publish(null);
    return null;
  }

  hookFocus();
  if (!watching) {
    watching = true;
    schedule();
  }
  return await check();
}
