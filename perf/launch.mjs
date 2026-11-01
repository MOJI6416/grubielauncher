import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareStand, standRoot, ensureCert } from "./stand.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const launcherDir = path.resolve(here, "..");
const require = createRequire(path.join(launcherDir, "package.json"));
const { chromium } = require("playwright");
const electronPath = require("electron");

const regKey = "HKCU\\Software\\Classes\\grubielauncher";
const proxyPort = 8079;
const cdpPort = 9341;
const inspectPort = 9342;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function backupProtocol() {
  if (process.platform !== "win32") return null;
  const file = path.join(standRoot, "..", "perf-protocol-backup.reg");
  if (!fs.existsSync(file)) {
    try {
      execFileSync("reg", ["export", regKey, file, "/y"], { stdio: "ignore" });
    } catch {}
  }
  return file;
}

export function restoreProtocol(file) {
  if (!file || !fs.existsSync(file)) return;
  try {
    execFileSync("reg", ["delete", regKey, "/f"], { stdio: "ignore" });
  } catch {}
  try {
    execFileSync("reg", ["import", file], { stdio: "ignore" });
  } catch {}
  fs.rmSync(file, { force: true });
}

export async function startApi({ logFile } = {}) {
  const child = spawn(process.execPath, [path.join(here, "fake-api.mjs")], {
    env: {
      ...process.env,
      PERF_CERT_DIR: ensureCert(),
      PERF_API_LOG: logFile || "",
      PERF_PROXY_PORT: String(proxyPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => String(d).includes("fake api") && resolve());
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (code) => reject(new Error(`fake api exited ${code}`)));
  });
  return child;
}

export async function inspectorEval(expression) {
  const list = await fetch(`http://127.0.0.1:${inspectPort}/json/list`).then((r) => r.json());
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const result = await new Promise((resolve, reject) => {
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      if (message.error) reject(new Error(message.error.message || "inspector error"));
      else if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.exception?.description || "main eval failed"));
      else resolve(message.result?.result?.value);
    };
    ws.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          expression: `(async () => { const electron = process.mainModule.require("electron"); return JSON.stringify(await (${expression})(electron)); })()`,
          awaitPromise: true,
          returnByValue: true,
        },
      }),
    );
  });
  ws.close();
  return result === undefined ? undefined : JSON.parse(result);
}

function startupProbe(bounds, traceIpc) {
  return `({ app, ipcMain }) => {
    if (globalThis.__perf) return true;
    const marks = { injectedAt: Date.now(), processStart: performance.timeOrigin, readyBeforeInject: app.isReady() };
    const ipc = [];
    globalThis.__perf = { marks, ipc };
    const originalHandle = ipcMain.handle.bind(ipcMain);
    if (${traceIpc ? "true" : "false"}) ipcMain.handle = (channel, handler) =>
      originalHandle(channel, async (...handlerArgs) => {
        const start = Date.now();
        const t = performance.now();
        try {
          return await handler(...handlerArgs);
        } finally {
          if (ipc.length < 5000) ipc.push({ channel, start, ms: Math.round((performance.now() - t) * 10) / 10 });
        }
      });
    if (!app.isReady()) app.once("ready", () => (marks.appReady = Date.now()));
    app.on("browser-window-created", (_, win) => {
      const createdAt = Date.now();
      const wc = win.webContents;
      const onNavigation = (event) => {
        if (marks.navStart || !event.isMainFrame || !event.url.startsWith("app://bundle/index.html")) return;
        wc.off("did-start-navigation", onNavigation);
        marks.windowCreated = createdAt;
        marks.navStart = Date.now();
        wc.once("dom-ready", () => (marks.domReady = Date.now()));
        win.once("ready-to-show", () => {
          marks.readyToShow = Date.now();
          win.setBounds(${JSON.stringify(bounds)});
          win.showInactive();
        });
        wc.once("did-finish-load", () => {
          marks.loaded = Date.now();
          const started = Date.now();
          const poll = async () => {
            const state = await wc
              .executeJavaScript("({ shell: !!(document.querySelector('aside') && document.querySelector('main')), home: !!document.querySelector('[data-home-hero]') && document.querySelectorAll('main button').length >= 10 })")
              .catch(() => ({}));
            const at = Date.now();
            if (state.shell && !marks.shell) marks.shell = at;
            if (state.home && !marks.home) marks.home = at;
            if (marks.home) return;
            if (at - started > 30000) return (marks.timedOut = true);
            setTimeout(poll, 16);
          };
          poll();
        });
      };
      wc.on("did-start-navigation", onNavigation);
    });
    return true;
  }`;
}

export async function launchApp({ fresh = true, offscreen = true, onInstrumented, traceIpc = false } = {}) {
  const dirs = fresh ? prepareStand() : { userData: path.join(standRoot, "userData"), data: path.join(standRoot, "data") };
  const spawnedAt = Date.now();
  const child = spawn(
    electronPath,
    [
      launcherDir,
      "--hidden",
      `--user-data-dir=${dirs.userData}`,
      `--remote-debugging-port=${cdpPort}`,
      `--inspect=${inspectPort}`,
      "--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost, EXCLUDE 127.0.0.1",
      "--ignore-certificate-errors",
    ],
    {
      cwd: launcherDir,
      env: {
        ...process.env,
        HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
        HTTP_PROXY: `http://127.0.0.1:${proxyPort}`,
        NO_PROXY: "localhost,127.0.0.1",
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const bounds = offscreen ? { x: -3000, y: 100, width: 1280, height: 720 } : { x: 120, y: 80, width: 1280, height: 720 };
  let instrumented = false;
  for (let i = 0; i < 1500 && !instrumented; i++) {
    instrumented = await inspectorEval(startupProbe(bounds, traceIpc)).then(() => true, () => false);
    if (!instrumented) await sleep(10);
  }
  if (!instrumented) throw new Error(`main inspector did not come up\n${output.slice(-2000)}`);
  if (onInstrumented) await onInstrumented(`http://127.0.0.1:${inspectPort}`);
  let marks = {};
  let lastError = null;
  for (let i = 0; i < 600; i++) {
    marks =
      (await inspectorEval(`() => globalThis.__perf?.marks ?? {}`).catch((error) => {
        lastError = error.message;
        return null;
      })) ?? marks;
    if (marks.home || marks.timedOut) break;
    await sleep(50);
  }
  if (!marks.home) console.warn(`perf: home mark missing (${lastError ?? "no inspector error"})`);
  let browser;
  for (let i = 0; i < 300 && !browser; i++) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`).catch(() => null);
    if (!browser) await sleep(50);
  }
  if (!browser) throw new Error(`CDP did not come up\n${output.slice(-2000)}`);
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith("app://bundle/index.html"));
  if (!page) throw new Error("main window did not appear");
  const cdp = await page.context().newCDPSession(page);
  return {
    child,
    browser,
    page,
    cdp,
    dirs,
    spawnedAt,
    marks,
    output: () => output,
    main: inspectorEval,
    async close() {
      await inspectorEval(`({ app }) => { setTimeout(() => app.exit(0), 50); return true; }`).catch(() => {});
      const exited = await Promise.race([new Promise((r) => child.once("exit", () => r(true))), sleep(8000).then(() => false)]);
      if (!exited) child.kill();
      await browser.close().catch(() => {});
      await sleep(500);
    },
  };
}
