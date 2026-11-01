import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { launchApp, startApi, backupProtocol, restoreProtocol, launcherDir } from "./launch.mjs";
import { ensureProbe, measureStep } from "./probe.mjs";
import { tour, goHome } from "./scenarios.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(launcherDir, "package.json"));
const { TraceMap, originalPositionFor } = require("@jridgewell/trace-mapping");

const { values: args } = parseArgs({
  options: {
    step: { type: "string" },
    repeat: { type: "string", default: "3" },
    top: { type: "string", default: "30" },
    cold: { type: "boolean", default: false },
  },
});

const maps = new Map();
function mapFor(url) {
  if (maps.has(url)) return maps.get(url);
  let map = null;
  const match = url.match(/^app:\/\/bundle\/(.+)$/);
  if (match) {
    const file = path.join(launcherDir, "out", "renderer", match[1]);
    if (fs.existsSync(`${file}.map`)) map = new TraceMap(fs.readFileSync(`${file}.map`, "utf8"));
  }
  maps.set(url, map);
  return map;
}

function locate(frame) {
  const map = mapFor(frame.url);
  if (!map || frame.lineNumber < 0) return `${frame.functionName || "(anon)"} ${frame.url.split("/").pop()}:${frame.lineNumber + 1}`;
  const original = originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber });
  const source = (original.source || "?").replace(/^.*?(node_modules|src)\//, "$1/");
  return `${original.name || frame.functionName || "(anon)"} ${source}:${original.line}`;
}

function aggregate(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  const total = new Map();
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children || []) parent.set(child, node.id);
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const ms = (dt[i + 1] ?? dt[i] ?? 0) / 1000;
    const node = byId.get(profile.samples[i]);
    const key = node.callFrame.url ? locate(node.callFrame) : node.callFrame.functionName || "(native)";
    self.set(key, (self.get(key) || 0) + ms);
    const seen = new Set();
    let current = node.id;
    while (current != null) {
      const n = byId.get(current);
      const k = n.callFrame.url ? locate(n.callFrame) : n.callFrame.functionName || "(native)";
      if (!seen.has(k)) {
        total.set(k, (total.get(k) || 0) + ms);
        seen.add(k);
      }
      current = parent.get(current);
    }
  }
  return { self, total };
}

if (args.step === "reload") {
  const api = await startApi({});
  const registry = backupProtocol();
  const app = await launchApp({ fresh: false });
  try {
    const { page, cdp } = app;
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    const self = new Map();
    const total = new Map();
    const repeat = Number(args.repeat);
    for (let round = 0; round < repeat; round++) {
      await new Promise((r) => setTimeout(r, 1500));
      await cdp.send("Profiler.start");
      const started = Date.now();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!document.querySelector("[data-home-hero]") && document.querySelectorAll("main button").length >= 10, null, { timeout: 20000, polling: 16 });
      const homeMs = Date.now() - started;
      await new Promise((r) => setTimeout(r, 300));
      const { profile } = await cdp.send("Profiler.stop");
      const result = aggregate(profile);
      for (const [k, v] of result.self) self.set(k, (self.get(k) || 0) + v);
      for (const [k, v] of result.total) total.set(k, (total.get(k) || 0) + v);
      const frames = await page.evaluate(() => performance.getEntriesByType("long-animation-frame").map((e) => Math.round(e.duration)));
      console.log(`reload ${round}: home ${homeMs} ms, long frames ${JSON.stringify(frames)}`);
    }
    const fmt = (map) =>
      [...map.entries()]
        .filter(([k]) => !/^\((idle|program|garbage collector|root)\)$/.test(k))
        .sort((a, b) => b[1] - a[1])
        .slice(0, Number(args.top))
        .map(([k, v]) => `${(v / repeat).toFixed(1).padStart(7)} ms  ${k}`)
        .join("\n");
    const report = `== renderer reload (avg of ${repeat})\n-- self\n${fmt(self)}\n-- total\n${fmt(total)}`;
    console.log(report);
    fs.writeFileSync(path.join(here, "results", "profile-reload.txt"), report);
  } finally {
    await app.close();
    api.kill();
    restoreProtocol(registry);
  }
  process.exit(0);
}

const steps = tour();
const targetIndex = steps.findIndex((s) => s.id === args.step);
if (targetIndex < 0) throw new Error(`unknown step ${args.step}; known: ${steps.map((s) => s.id).join(", ")}`);
const api = await startApi({});
const registry = backupProtocol();
const app = await launchApp({ fresh: true });
try {
  const { page, cdp } = app;
  page.setDefaultTimeout(15000);
  await ensureProbe(page);
  await new Promise((r) => setTimeout(r, 2500));
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
  const combinedSelf = new Map();
  const combinedTotal = new Map();
  const repeat = Number(args.repeat);
  for (let round = 0; round < repeat + (args.cold ? 0 : 1); round++) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await goHome(page);
    await new Promise((r) => setTimeout(r, 300));
    for (const s of steps.slice(0, targetIndex)) {
      await measureStep(page, () => s.act(page), { ready: s.ready, quiet: 150, fromLastInput: s.kind === "typing" }).catch(() => {});
    }
    const record = round > 0 || args.cold;
    if (record) await cdp.send("Profiler.start");
    const target = steps[targetIndex];
    const sample = await measureStep(page, () => target.act(page), { ready: target.ready, quiet: 300, fromLastInput: target.kind === "typing" });
    if (!record) continue;
    const { profile } = await cdp.send("Profiler.stop");
    const { self, total } = aggregate(profile);
    for (const [k, v] of self) combinedSelf.set(k, (combinedSelf.get(k) || 0) + v);
    for (const [k, v] of total) combinedTotal.set(k, (combinedTotal.get(k) || 0) + v);
    console.log(`round ${round}: ready ${sample.ready} settle ${sample.settle} inp ${sample.inp} tbt ${sample.tbt} max ${sample.maxFrame}`);
  }
  const fmt = (map) =>
    [...map.entries()]
      .filter(([k]) => !/^\((idle|program|garbage collector|root)\)$/.test(k) && k !== "(idle)")
      .sort((a, b) => b[1] - a[1])
      .slice(0, Number(args.top))
      .map(([k, v]) => `${(v / repeat).toFixed(1).padStart(7)} ms  ${k}`)
      .join("\n");
  const idle = ["(idle)", "(program)", "(garbage collector)"].map((k) => `${k} ${((combinedSelf.get(k) || 0) / repeat).toFixed(1)}`).join(" · ");
  const report = `== ${args.step} (avg of ${repeat})\n${idle}\n-- self\n${fmt(combinedSelf)}\n-- total\n${fmt(combinedTotal)}`;
  console.log(report);
  fs.mkdirSync(path.join(here, "results"), { recursive: true });
  fs.writeFileSync(path.join(here, "results", `profile-${args.step}.txt`), report);
} finally {
  await app.close();
  api.kill();
  restoreProtocol(registry);
}
