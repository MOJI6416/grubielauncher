import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow, dialog } from "electron";
import fs from "fs-extra";
import path from "path";
import { LANGUAGES } from "@/types/Settings";
import type {
  DataLocationFile,
  DataLocationWindowAction,
  DataLocationWindowState,
} from "@/types/DataLocation";
import { check, handleSafe } from "../utilities/ipc";
import {
  getDataRoot,
  getDefaultDataRoot,
  isSamePath,
  overlapsPath,
  readDataLocation,
  writeDataLocation,
} from "../utilities/dataRoot";
import {
  DataMoveError,
  isAbortError,
  isDirectory,
  MOVE_MARKER,
  moveDataRoot,
  planDataTarget,
  removeOldDataRoot,
} from "../utilities/dataMove";
import { getSystemRoots } from "../utilities/safePath";
import { rebaseShortcutIcons } from "../utilities/shortcut";

const WINDOW_WIDTH = 440;
const WINDOW_HEIGHT = 320;
const PROGRESS_INTERVAL_MS = 120;
const CLEANUP_DELAY_MS = 30_000;

let window: BrowserWindow | null = null;
let state: DataLocationWindowState | null = null;
let waiter: ((action: DataLocationWindowAction) => void) | null = null;
let moveAbort: AbortController | null = null;
let ipcReady = false;

export function getProtectedDataRoots(): string[] {
  const roots = [...getSystemRoots(), app.getPath("userData")];
  if (app.isPackaged) roots.push(path.dirname(process.execPath));
  return roots;
}

function resolveWindowLanguage(root: string | null): string {
  const codes = LANGUAGES.map((language) => language.code);

  if (root) {
    try {
      const settings = fs.readJsonSync(path.join(root, "settings.json"));
      if (codes.includes(settings?.lang)) return settings.lang;
    } catch {}
  }

  const locale = app.getLocale().toLowerCase();
  return codes.find((code) => locale.startsWith(code)) ?? "en";
}

function setState(next: DataLocationWindowState): void {
  state = next;
  if (window && !window.isDestroyed()) {
    window.webContents.send("dataLocationWindow:state", next);
  }
}

function dispatch(action: DataLocationWindowAction): void {
  if (action === "cancel") {
    if (moveAbort && state?.kind === "moving" && state.phase !== "finish") {
      moveAbort.abort();
      setState({ ...state, cancelling: true });
    }
    return;
  }

  const resolve = waiter;
  waiter = null;
  resolve?.(action);
}

function nextAction(): Promise<DataLocationWindowAction> {
  return new Promise((resolve) => {
    waiter = resolve;
  });
}

function registerIpc(): void {
  if (ipcReady) return;
  ipcReady = true;

  handleSafe<DataLocationWindowState | null>(
    "dataLocationWindow:getState",
    null,
    () => state,
  );

  handleSafe<void, [DataLocationWindowAction]>(
    "dataLocationWindow:action",
    undefined,
    [check.oneOf("cancel", "continue", "retry", "pick", "useDefault", "quit")],
    (_event, action) => dispatch(action),
  );
}

function ensureWindow(): BrowserWindow {
  if (window && !window.isDestroyed()) return window;
  registerIpc();

  const created = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    title: "Grubie Launcher",
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

  created.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  created.webContents.on("will-navigate", (event) => event.preventDefault());
  created.once("ready-to-show", () => created.show());
  created.on("close", (event) => {
    event.preventDefault();
    if (state?.kind === "moving") dispatch("cancel");
    else if (state?.kind === "failed") dispatch("continue");
    else dispatch("quit");
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void created.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/datalocation`,
    );
  } else {
    void created.loadURL("app://bundle/datalocation.html");
  }

  window = created;
  return created;
}

function destroyWindow(): void {
  const target = window;
  window = null;
  state = null;
  if (target && !target.isDestroyed()) target.destroy();
}

function releaseWindow(): void {
  const target = window;
  window = null;
  state = null;
  if (!target || target.isDestroyed()) return;

  target.removeAllListeners("close");
  target.hide();
  app.once("browser-window-created", () => {
    setTimeout(() => {
      if (!target.isDestroyed()) target.destroy();
    }, 0);
  });
}

async function runPendingMove(
  location: DataLocationFile & { move: { from: string; to: string } },
): Promise<void> {
  const { from, to } = location.move;

  if (!isSamePath(from, getDataRoot()) || overlapsPath(from, to)) {
    writeDataLocation({ ...location, move: undefined });
    return;
  }

  const lang = resolveWindowLanguage(from);
  const controller = new AbortController();
  let copiedBytes = 0;
  let totalBytes = 0;
  let lastSent = 0;

  moveAbort = controller;
  ensureWindow();
  setState({
    kind: "moving",
    lang,
    from,
    to,
    phase: "scan",
    copiedBytes,
    totalBytes,
    cancelling: false,
  });

  try {
    const outcome = await moveDataRoot(from, to, {
      signal: controller.signal,
      onProgress: (progress) => {
        copiedBytes = progress.copiedBytes;
        totalBytes = progress.totalBytes;

        const now = Date.now();
        const settled =
          progress.phase === "scan" ||
          progress.copiedBytes >= progress.totalBytes;
        if (!settled && now - lastSent < PROGRESS_INTERVAL_MS) return;
        lastSent = now;

        setState({
          kind: "moving",
          lang,
          from,
          to,
          phase: progress.phase,
          copiedBytes,
          totalBytes,
          cancelling: controller.signal.aborted,
        });
      },
    });

    moveAbort = null;
    setState({
      kind: "moving",
      lang,
      from,
      to,
      phase: "finish",
      copiedBytes,
      totalBytes,
      cancelling: false,
    });

    const latest = readDataLocation();
    writeDataLocation({
      root: to,
      cleanup:
        outcome === "copied"
          ? [...(latest.cleanup ?? []), from]
          : latest.cleanup,
    });
    await fs.remove(path.join(to, MOVE_MARKER)).catch(() => undefined);
    await rebaseShortcutIcons(from, to).catch(() => 0);
  } catch (error) {
    moveAbort = null;
    writeDataLocation({ ...readDataLocation(), move: undefined });
    if (isAbortError(error)) return;

    console.error("[DataLocation] Move failed:", error);
    setState({
      kind: "failed",
      lang,
      from,
      to,
      reason: error instanceof DataMoveError ? error.reason : "io",
      detail:
        error instanceof DataMoveError
          ? error.detail
          : error instanceof Error
            ? error.message
            : String(error),
    });
    await nextAction();
  }
}

async function resolveMissingRoot(root: string): Promise<boolean> {
  const lang = resolveWindowLanguage(null);
  const show = (
    problem: Extract<DataLocationWindowState, { kind: "missing" }>["problem"],
    busy = false,
  ) => setState({ kind: "missing", lang, root, busy, problem });

  ensureWindow();
  show(null);

  for (;;) {
    const action = await nextAction();

    if (action === "quit") return false;

    if (action === "retry") {
      if (await isDirectory(root)) return true;
      show("stillMissing");
      continue;
    }

    if (action === "useDefault") {
      const defaultRoot = getDefaultDataRoot();
      const location = readDataLocation();
      writeDataLocation({
        cleanup: location.cleanup?.filter(
          (entry) => !overlapsPath(entry, defaultRoot),
        ),
      });
      return true;
    }

    if (action !== "pick" || !window) continue;

    show(null, true);
    const picked = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
    });
    const chosen = picked.canceled ? null : picked.filePaths[0];
    if (!chosen) {
      show(null);
      continue;
    }

    const location = readDataLocation();
    const plan = await planDataTarget({
      chosen,
      current: root,
      adoptOnly: true,
      protectedRoots: getProtectedDataRoots(),
      cleanup: location.cleanup ?? [],
    });

    const target =
      plan.kind === "adopt"
        ? plan.target
        : plan.kind === "error" &&
            plan.problem === "same" &&
            (await isDirectory(root))
          ? root
          : null;

    if (target) {
      writeDataLocation({
        root: target,
        cleanup: location.cleanup?.filter(
          (entry) => !overlapsPath(entry, target),
        ),
      });
      return true;
    }

    show(plan.kind === "error" ? plan.problem : null);
  }
}

async function runCleanup(): Promise<void> {
  const root = getDataRoot();

  for (const dir of readDataLocation().cleanup ?? []) {
    let outcome: Awaited<ReturnType<typeof removeOldDataRoot>>;
    try {
      outcome = await removeOldDataRoot(dir, root);
    } catch (error) {
      console.warn(`[DataLocation] Could not remove ${dir}:`, error);
      outcome = "failed";
    }
    if (outcome === "failed") continue;

    const latest = readDataLocation();
    writeDataLocation({
      ...latest,
      cleanup: latest.cleanup?.filter((entry) => !isSamePath(entry, dir)),
    });
  }
}

export async function prepareDataRoot(): Promise<boolean> {
  try {
    const pending = readDataLocation();
    if (pending.move) await runPendingMove({ ...pending, move: pending.move });

    const location = readDataLocation();
    const root = getDataRoot();

    if (location.root && !(await isDirectory(root))) {
      if (!(await resolveMissingRoot(root))) {
        destroyWindow();
        return false;
      }
    }

    await fs
      .remove(path.join(getDataRoot(), MOVE_MARKER))
      .catch(() => undefined);
  } catch (error) {
    console.error("[DataLocation] Startup check failed:", error);
  }

  releaseWindow();

  if (readDataLocation().cleanup?.length) {
    setTimeout(() => void runCleanup(), CLEANUP_DELAY_MS);
  }

  return true;
}
