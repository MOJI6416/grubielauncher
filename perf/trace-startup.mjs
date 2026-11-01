import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { launchApp, startApi, backupProtocol, restoreProtocol, launcherDir } from "./launch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(launcherDir, "package.json"));
const { TraceMap, originalPositionFor } = require("@jridgewell/trace-mapping");

const maps = new Map();
function locate(frame) {
  if (!frame.url) return frame.functionName || "(native)";
  let file = frame.url.startsWith("file://") ? fileURLToPath(frame.url) : frame.url;
  if (!maps.has(file)) maps.set(file, fs.existsSync(`${file}.map`) ? new TraceMap(fs.readFileSync(`${file}.map`, "utf8")) : null);
  const map = maps.get(file);
  const short = file.replace(/^.*?(node_modules|out)[\\/]/, "$1/");
  if (!map || frame.lineNumber < 0) return `${frame.functionName || "(anon)"} ${short}:${frame.lineNumber + 1}`;
  const original = originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber });
  return `${original.name || frame.functionName || "(anon)"} ${(original.source || short).replace(/^.*?(node_modules|src)\//, "$1/")}:${original.line}`;
}

function aggregate(profile, top) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children || []) parent.set(child, node.id);
  const self = new Map();
  const total = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const ms = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const node = byId.get(profile.samples[i]);
    const key = locate(node.callFrame);
    self.set(key, (self.get(key) || 0) + ms);
    const seen = new Set();
    for (let current = node.id; current != null; current = parent.get(current)) {
      const k = locate(byId.get(current).callFrame);
      if (seen.has(k)) continue;
      seen.add(k);
      total.set(k, (total.get(k) || 0) + ms);
    }
  }
  const fmt = (map) =>
    [...map.entries()]
      .filter(([k]) => !/^\((idle|program|garbage collector|root)\)$/.test(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([k, v]) => `${v.toFixed(1).padStart(7)} ms  ${k}`)
      .join("\n");
  return `-- self\n${fmt(self)}\n-- total\n${fmt(total)}`;
}

const api = await startApi({});
const registry = backupProtocol();
let session;
const pending = new Map();
let nextId = 1;
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    session.send(JSON.stringify({ id, method, params }));
  });
try {
  const app = await launchApp({
    fresh: process.argv.includes("--cold"),
    traceIpc: true,
    onInstrumented: async (base) => {
      const list = await fetch(`${base}/json/list`).then((r) => r.json());
      session = new WebSocket(list[0].webSocketDebuggerUrl);
      await new Promise((resolve) => (session.onopen = resolve));
      session.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
          pending.get(message.id)(message.result);
          pending.delete(message.id);
        }
      };
      await send("Profiler.enable");
      await send("Profiler.setSamplingInterval", { interval: 200 });
      await send("Profiler.start");
    },
  });
  const { profile } = await send("Profiler.stop");
  session.close();
  const ipc = await app.main(`() => globalThis.__perf.ipc`);
  const marks = app.marks;
  const rel = (t) => t - app.spawnedAt;
  const lines = [];
  lines.push(`marks: ${Object.entries(marks).filter(([, v]) => typeof v === "number" && v > 1e12).map(([k, v]) => `${k} ${Math.round(rel(v))}`).join(" · ")}`);
  lines.push("-- ipc until home (start ms after spawn, duration)");
  const untilHome = ipc.filter((call) => call.start <= (marks.home ?? Infinity));
  const byChannel = new Map();
  for (const call of untilHome) {
    lines.push(`${String(Math.round(rel(call.start))).padStart(6)} ${String(call.ms).padStart(7)}  ${call.channel}`);
    const entry = byChannel.get(call.channel) ?? { count: 0, ms: 0 };
    entry.count++;
    entry.ms += call.ms;
    byChannel.set(call.channel, entry);
  }
  lines.push("-- ipc by channel");
  for (const [channel, entry] of [...byChannel.entries()].sort((a, b) => b[1].ms - a[1].ms)) {
    lines.push(`${String(entry.count).padStart(4)}× ${entry.ms.toFixed(1).padStart(8)} ms  ${channel}`);
  }
  lines.push("-- main cpu (process start → home)");
  lines.push(aggregate(profile, 35));
  const report = lines.join("\n");
  console.log(report);
  fs.mkdirSync(path.join(here, "results"), { recursive: true });
  fs.writeFileSync(path.join(here, "results", "trace-startup.txt"), report);
  await app.close();
} finally {
  api.kill();
  restoreProtocol(registry);
}
