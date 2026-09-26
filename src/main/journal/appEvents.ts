import { app, BrowserWindow, powerMonitor } from "electron";
import os from "os";
import path from "path";
import { getJournalWriter, journal } from "./journal";
import type { JournalLevel } from "@/types/Journal";

let installed = false;

function pageOf(url: string | undefined): string {
  if (!url) return "";
  const withoutQuery = url.split(/[?#]/)[0];
  return withoutQuery.startsWith("app://")
    ? withoutQuery.replace(/^app:\/\/[^/]+/, "")
    : withoutQuery;
}

function consoleLevel(level: string | number): JournalLevel {
  if (level === "error" || level === 3) return "error";
  if (level === "warning" || level === 2) return "warn";
  return "debug";
}

function traceWindow(window: BrowserWindow): void {
  const id = window.id;
  const contents = window.webContents;
  const page = () => {
    try {
      return pageOf(contents.getURL());
    } catch {
      return "";
    }
  };

  window.on("unresponsive", () => {
    journal.warn("window", "window stopped responding", { id, page: page() });
  });
  window.on("responsive", () => {
    journal.info("window", "window responds again", { id, page: page() });
  });

  contents.on(
    "did-fail-load",
    (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      journal.error("window", "page failed to load", {
        id,
        code,
        description,
        page: pageOf(url),
      });
    },
  );

  contents.on("did-finish-load", () => {
    journal.debug("window", "page loaded", { id, page: page() });
  });

  contents.on("preload-error", (_event, preloadPath, error) => {
    journal.failure("window", "preload script failed", error, {
      id,
      preload: path.basename(preloadPath),
    });
  });

  contents.on("console-message", (event) => {
    const details = event as unknown as {
      level: string | number;
      message: string;
      lineNumber?: number;
      sourceId?: string;
    };
    const level = consoleLevel(details.level);
    if (level === "debug" && !journal.isVerbose()) return;
    if (String(details.message ?? "").startsWith("Uncaught ")) return;

    journal.ui({
      t: Date.now(),
      l: level,
      s: "console",
      m: String(details.message ?? ""),
      d: {
        window: id,
        source: details.sourceId
          ? `${pageOf(details.sourceId)}:${details.lineNumber ?? 0}`
          : undefined,
      },
    });
  });
}

export function logSessionStart(): void {
  let logsDir = "";
  try {
    logsDir = app.getPath("logs");
  } catch {}

  journal.info("app", "session start", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpu: os.cpus()[0]?.model?.trim(),
    cores: os.cpus().length,
    totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemMb: Math.round(os.freemem() / 1024 / 1024),
    pid: process.pid,
    exe: process.execPath,
    args: process.argv.slice(1).filter((arg) => arg.startsWith("-")),
    logsDir,
  });
}

export function installAppEventTrace(): void {
  if (installed) return;
  installed = true;

  logSessionStart();

  app.on("render-process-gone", (_event, contents, details) => {
    let page = "";
    try {
      page = pageOf(contents.getURL());
    } catch {}
    journal.error("app", "renderer process gone", {
      reason: details.reason,
      exitCode: details.exitCode,
      page,
    });
    journal.flushSync();
  });

  app.on("child-process-gone", (_event, details) => {
    journal[details.reason === "clean-exit" ? "info" : "error"](
      "app",
      "child process gone",
      {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
        name: details.name,
        service: details.serviceName,
      },
    );
  });

  app.on("browser-window-created", (_event, window) => {
    traceWindow(window);
  });

  app.on("second-instance", () => {
    journal.info("app", "second launcher instance started");
  });

  app.on("before-quit", () => {
    journal.info("app", "quit requested");
  });

  app.on("will-quit", () => {
    journal.info("app", "quitting");
    journal.flushSync();
  });

  process.on("exit", (code) => {
    journal.info("app", "process exit", { code });
    journal.flushSync();
  });

  void app.whenReady().then(() => {
    let gpu: unknown;
    try {
      gpu = app.getGPUFeatureStatus();
    } catch {}

    journal.info("app", "ready", {
      locale: app.getLocale(),
      systemLocale: app.getSystemLocale(),
      gpu,
    });

    powerMonitor.on("suspend", () => journal.info("power", "system suspend"));
    powerMonitor.on("resume", () => journal.info("power", "system resume"));
    powerMonitor.on("shutdown", () => {
      journal.info("power", "system shutdown");
      journal.flushSync();
    });

    setTimeout(() => {
      void getJournalWriter()?.prune();
    }, 15_000).unref();
  });
}
