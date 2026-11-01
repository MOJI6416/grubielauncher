import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { launchApp, startApi, backupProtocol, restoreProtocol } from "./launch.mjs";
import { ensureProbe, measureStep, measureFrames, waitReady, heap, processMemory } from "./probe.mjs";
import { tour, goHome } from "./scenarios.mjs";
import { checkBudgets, formatReport } from "./report.mjs";
import { memoryRoute } from "./scenarios.mjs";
import { standRoot } from "./stand.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    label: { type: "string", default: "local" },
    tours: { type: "string", default: "4" },
    cold: { type: "string", default: "3" },
    warm: { type: "string", default: "5" },
    only: { type: "string", default: "" },
    skipStartup: { type: "boolean", default: false },
    skipTour: { type: "boolean", default: false },
    skipMemory: { type: "boolean", default: false },
    idle: { type: "string", default: "3000" },
    memoryRounds: { type: "string", default: "5" },
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

async function blockGameLaunch(app) {
  await app.main(`({ ipcMain }) => {
    for (const channel of ["version:run", "version:install"]) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => { throw new Error("perf stand: " + channel + " is disabled"); });
    }
    return true;
  }`);
}

async function startupSample(app) {
  const renderer = await app.page.evaluate(async () => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    const lcp = await new Promise((resolve) => {
      let last = null;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) last = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      setTimeout(() => resolve(last), 50);
    });
    const frames = await new Promise((resolve) => {
      const all = [];
      new PerformanceObserver((list) => all.push(...list.getEntries())).observe({ type: "long-animation-frame", buffered: true });
      setTimeout(() => resolve(all.map((e) => ({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration }))), 50);
    });
    const scripts = performance
      .getEntriesByType("resource")
      .filter((e) => e.initiatorType === "script" || e.name.endsWith(".js"))
      .reduce((sum, e) => sum + (e.decodedBodySize || 0), 0);
    return { origin: performance.timeOrigin, domContentLoaded: nav?.domContentLoadedEventEnd ?? null, fcp, lcp, frames, scriptKB: Math.round(scripts / 1024) };
  });
  const m = app.marks;
  const rel = (value) => (value ? Math.round(value - app.spawnedAt) : null);
  const relRenderer = (value) => (value == null ? null : Math.round(renderer.origin + value - app.spawnedAt));
  const homeAt = m.home ? m.home - renderer.origin : Infinity;
  const startupFrames = renderer.frames.filter((frame) => frame.start <= homeAt + 500);
  return {
    processStart: rel(m.processStart),
    appReady: rel(m.appReady),
    windowCreated: rel(m.windowCreated),
    domReady: rel(m.domReady),
    readyToShow: rel(m.readyToShow),
    fcp: relRenderer(renderer.fcp),
    shell: rel(m.shell),
    home: rel(m.home),
    lcp: relRenderer(renderer.lcp),
    mainToHome: m.home && m.navStart ? Math.round(m.home - m.navStart) : null,
    startupTbt: Math.round(startupFrames.reduce((sum, frame) => sum + frame.blocking, 0)),
    startupMaxFrame: Math.round(startupFrames.reduce((max, frame) => Math.max(max, frame.duration), 0)),
    scriptKB: renderer.scriptKB,
  };
}

async function runStartups(results) {
  const kinds = [
    ["cold", Number(args.cold)],
    ["warm", Number(args.warm)],
  ];
  for (const [kind, count] of kinds) {
    if (kind === "warm" && count > 0) {
      const seeding = await launchApp({ fresh: true });
      await sleep(4000);
      await seeding.close();
    }
    for (let index = 0; index < count; index++) {
      const app = await launchApp({ fresh: kind === "cold" });
      const sample = await startupSample(app);
      await sleep(5000);
      sample.idle = await processMemory(app.main);
      sample.idleHeap = await heap(app.cdp);
      results.startup[kind].push(sample);
      console.log(`startup ${kind} #${index + 1}: home ${sample.home} ms, shell ${sample.shell} ms, tbt ${sample.startupTbt} ms, private ${sample.idle.privateMB} MB`);
      await app.close();
    }
  }
}

async function runMemory(results) {
  const app = await launchApp({ fresh: true });
  await blockGameLaunch(app);
  const { page, cdp } = app;
  await sleep(3000);
  const snapshot = async () => ({ ...(await processMemory(app.main)), ...(await heap(cdp)) });
  results.memory.idle = await snapshot();
  const rounds = Number(args.memoryRounds);
  for (let round = 0; round < rounds; round++) {
    for (const target of memoryRoute) {
      const clicked = await page.evaluate(({ scope, text }) => {
        const element = [...document.querySelectorAll(scope)].find((candidate) => candidate.innerText.trim().startsWith(text));
        element?.click();
        return !!element;
      }, target);
      if (!clicked) console.log(`memory: no target ${target.scope} "${target.text}"`);
      await sleep(target.wait ?? 600);
    }
    await sleep(1500);
    if (round === 0) results.memory.afterFirstTour = await snapshot();
    if (round === rounds - 1) results.memory.afterLastTour = await snapshot();
    console.log(`memory round ${round + 1}: ${JSON.stringify(await heap(cdp))}`);
  }
  await app.close();
}

async function runTours(results) {
  const app = await launchApp({ fresh: true });
  await blockGameLaunch(app);
  const { page } = app;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  await ensureProbe(page);
  await sleep(Number(args.idle));
  const steps = tour().filter((s) => !args.only || args.only.split(",").some((prefix) => s.id.startsWith(prefix)));
  const tours = Number(args.tours);
  for (let round = 0; round < tours; round++) {
    await goHome(page);
    await sleep(400);
    for (const s of steps) {
      let sample;
      try {
        if (s.kind === "frames") {
          sample = await measureFrames(page, () => s.act(page));
        } else {
          sample = await measureStep(page, () => s.act(page), { ready: s.ready, quiet: 300, fromLastInput: s.kind === "typing" });
          if (sample.timedOut && s.ready) {
            const ok = await page.evaluate((r) => window.__perf.isReady(r), s.ready);
            sample.readyMissing = !ok;
          }
        }
      } catch (error) {
        sample = { error: String(error).split("\n")[0].slice(0, 200) };
        await goHome(page).catch(() => {});
      }
      (results.steps[s.id] ??= { title: s.title, kind: s.kind ?? "nav", samples: [] }).samples.push(sample);
      const brief = sample.error ? `ERROR ${sample.error}` : s.kind === "frames" ? `p95 ${sample.p95Frame} ms, >17ms ${sample.over17Pct}%, >33ms ${sample.over33Pct}%` : `ready ${sample.ready} ms, settle ${sample.settle} ms, inp ${sample.inp}, tbt ${sample.tbt}${sample.timedOut ? " TIMEOUT" : ""}`;
      console.log(`tour ${round + 1} ${s.id}: ${brief}`);
      await sleep(150);
    }
  }
  results.errors = errors;
  await app.close();
}

function summarize(results) {
  const summary = { startup: {}, steps: {}, memory: results.memory };
  for (const kind of ["cold", "warm"]) {
    const samples = results.startup[kind];
    if (!samples.length) continue;
    const keys = Object.keys(samples[0]).filter((key) => typeof samples[0][key] === "number");
    summary.startup[kind] = Object.fromEntries(keys.map((key) => [key, median(samples.map((s) => s[key]))]));
    summary.startup[kind].privateMB = median(samples.map((s) => s.idle.privateMB));
    summary.startup[kind].heapMB = median(samples.map((s) => s.idleHeap.heapMB));
  }
  for (const [id, entry] of Object.entries(results.steps)) {
    const [first, ...rest] = entry.samples;
    const warm = rest.length ? rest : [first];
    const metrics = entry.kind === "frames" ? ["p95Frame", "over17Pct", "over33Pct", "tbt", "maxFrame"] : ["ready", "settle", "inp", "tbt", "maxFrame"];
    summary.steps[id] = {
      title: entry.title,
      kind: entry.kind,
      cold: Object.fromEntries(metrics.map((key) => [key, first?.[key] ?? null])),
      warm: Object.fromEntries(metrics.map((key) => [key, median(warm.map((s) => s[key]))])),
      errors: entry.samples.filter((s) => s.error).length,
      timeouts: entry.samples.filter((s) => s.timedOut).length,
      topScripts: (first?.topScripts || []).slice(0, 3),
    };
  }
  return summary;
}

const resultsDir = path.join(here, "results");
fs.mkdirSync(resultsDir, { recursive: true });
const results = { label: args.label, at: new Date().toISOString(), startup: { cold: [], warm: [] }, steps: {}, memory: {} };
const api = await startApi({ logFile: path.join(standRoot, "..", "perf-api.jsonl") });
const registry = backupProtocol();
try {
  if (!args.skipStartup) await runStartups(results);
  if (!args.skipTour) await runTours(results);
  if (!args.skipMemory) await runMemory(results);
} finally {
  api.kill();
  restoreProtocol(registry);
}
results.summary = summarize(results);
const budgets = JSON.parse(fs.readFileSync(path.join(here, "budgets.json"), "utf8"));
results.budget = checkBudgets(results.summary, budgets);
fs.writeFileSync(path.join(resultsDir, `${args.label}.json`), JSON.stringify(results, null, 2));
console.log(formatReport(results.summary, results.budget));
console.log(`\nsaved ${path.join(resultsDir, `${args.label}.json`)}`);
