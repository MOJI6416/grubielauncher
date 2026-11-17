import { app } from "electron";
import fs from "fs";
import path from "path";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

const scenario = argument("scenario");
const instance = argument("instance");
const data = argument("data");

fs.mkdirSync(data, { recursive: true });
app.setPath("appData", path.join(data, "appData"));
app.setPath("userData", path.join(data, "userData"));

const peak = { rss: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
const sample = () => {
  const usage = process.memoryUsage();
  peak.rss = Math.max(peak.rss, usage.rss);
  peak.heapUsed = Math.max(peak.heapUsed, usage.heapUsed);
  peak.external = Math.max(peak.external, usage.external);
  peak.arrayBuffers = Math.max(peak.arrayBuffers, usage.arrayBuffers);
};

async function run(): Promise<number> {
  const mods = path.join(instance, "mods");
  if (scenario === "deps") {
    const { scanLocalModDependencies } = await import(
      "../src/main/utilities/localModDependencies"
    );
    return Object.keys(await scanLocalModDependencies(instance)).length;
  }
  if (scenario === "meta") {
    const { checkLocalMod } = await import("../src/main/utilities/modManager");
    let found = 0;
    for (const file of fs.readdirSync(mods).filter((name) => name.endsWith(".jar"))) {
      if (await checkLocalMod(path.join(mods, file))) found++;
    }
    return found;
  }
  throw new Error(`unknown scenario ${scenario}`);
}

app.whenReady().then(async () => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const baseline = process.memoryUsage();
    const timer = setInterval(sample, 5);
    const started = performance.now();
    const count = await run();
    const timeMs = performance.now() - started;
    sample();
    clearInterval(timer);
    const mb = (value: number) => Math.round((value / 1024 / 1024) * 10) / 10;
    process.stdout.write(
      `SCAN_RESULT ${JSON.stringify({
        scenario,
        count,
        timeMs: Math.round(timeMs),
        baselineRssMB: mb(baseline.rss),
        peakRssMB: mb(peak.rss),
        deltaRssMB: mb(peak.rss - baseline.rss),
        peakHeapMB: mb(peak.heapUsed),
        peakExternalMB: mb(peak.external),
        peakArrayBuffersMB: mb(peak.arrayBuffers),
        maxRssMB: mb(process.resourceUsage().maxRSS * 1024),
      })}\n`,
    );
    app.exit(0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    app.exit(1);
  }
});
