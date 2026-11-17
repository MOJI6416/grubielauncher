import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const local = process.env.LOCALAPPDATA || path.join(process.env.HOME || ".", ".local", "share");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const label = option("label", "scan");
const runs = Number(option("runs", "3"));
const instance = path.resolve(option("instance", path.join(local, "grubie-stand", "scan-mods")));
const scenarios = option("scenarios", "deps,meta").split(",");
const resultsDir = path.join(here, "results");
const workDir = path.join(resultsDir, ".archive-scan");
const bundle = path.join(workDir, "entry.cjs");

if (!fs.existsSync(path.join(instance, "mods"))) {
  throw new Error(`no mods folder in ${instance} (pass --instance <folder with mods/>)`);
}

await build({
  entryPoints: [path.join(here, "archive-scan-entry.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: bundle,
  external: ["electron", "uiohook-napi", "electron-updater"],
  alias: { "@": path.join(root, "src"), "@renderer": path.join(root, "src", "renderer", "src") },
  logLevel: "warning",
});

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function runOnce(scenario, index) {
  const data = path.join(workDir, `data-${scenario}-${index}`);
  fs.rmSync(data, { recursive: true, force: true });
  const result = spawnSync(
    require("electron"),
    [bundle, "--scenario", scenario, "--instance", instance, "--data", data],
    { encoding: "utf8", env: { ...process.env, ELECTRON_ENABLE_LOGGING: "" }, maxBuffer: 64 * 1024 * 1024 },
  );
  const line = result.stdout.split(/\r?\n/).find((text) => text.startsWith("SCAN_RESULT "));
  if (!line) throw new Error(`${scenario} failed:\n${result.stderr}`);
  return JSON.parse(line.slice("SCAN_RESULT ".length));
}

const summary = {};
for (const scenario of scenarios) {
  runOnce(scenario, "warmup");
  const samples = Array.from({ length: runs }, (_, index) => runOnce(scenario, index));
  const keys = Object.keys(samples[0]).filter((key) => typeof samples[0][key] === "number");
  summary[scenario] = Object.fromEntries(keys.map((key) => [key, median(samples.map((sample) => sample[key]))]));
  summary[scenario].samples = samples;
  const { count, timeMs, deltaRssMB, maxRssMB, peakExternalMB } = summary[scenario];
  console.log(`${scenario}: ${count} jars, ${timeMs} ms, +${deltaRssMB} MB rss, peak ${maxRssMB} MB, external ${peakExternalMB} MB`);
}

fs.mkdirSync(resultsDir, { recursive: true });
const file = path.join(resultsDir, `scan-${label}.json`);
fs.writeFileSync(file, JSON.stringify({ label, instance, runs, at: new Date().toISOString(), summary }, null, 2));
fs.rmSync(workDir, { recursive: true, force: true });
console.log(`saved ${path.relative(root, file)}`);
