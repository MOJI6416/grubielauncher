import { execFile } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";
import type { ISessionResources } from "@/types/VersionStatistics";

export const GC_LOG_ARGUMENT_PATH = "logs/grubie-gc.log";

const OWN_GC_LOGGING = /^(-Xlog(:|$)|-Xloggc:|-verbose:gc$|-XX:\+PrintGC)/;
const NON_HOTSPOT = /openj9|semeru|\bibm\b/i;
const MAX_LOG_BYTES = 64 * 1024 * 1024;
const LONG_PAUSE_MS = 100;
const SAMPLE_MS = 15_000;
const LOAD_SETTLE_MS = 10_000;

const ATLAS_LINE = /Created: \d+x\d+(?:x\d+)? \S*atlas/;
const WORLD_START_LINE =
  /Starting integrated minecraft server|Connecting to \S+, ?\d+|Preparing spawn area|Joined singleplayer/;

export function gcLogArguments(options: {
  javaMajor: number | null | undefined;
  javaVendor: string | null | undefined;
  jvm: string[];
}): string[] {
  const major = options.javaMajor;
  if (!major || !Number.isFinite(major)) return [];
  if (NON_HOTSPOT.test(options.javaVendor ?? "")) return [];
  if (options.jvm.some((arg) => OWN_GC_LOGGING.test(arg))) return [];
  return major >= 9
    ? [`-Xlog:gc:file=${GC_LOG_ARGUMENT_PATH}:uptime:filecount=0`]
    : [`-Xloggc:${GC_LOG_ARGUMENT_PATH}`];
}

export async function prepareGcLog(workingDirectory: string): Promise<string | null> {
  const file = path.join(workingDirectory, ...GC_LOG_ARGUMENT_PATH.split("/"));
  try {
    await fs.ensureDir(path.dirname(file));
    await fs.remove(file);
    return file;
  } catch {
    return null;
  }
}

export interface GcSummary {
  collector?: string;
  typicalMb?: number;
  peakMb?: number;
  capacityMb?: number;
  pauses?: NonNullable<ISessionResources["pauses"]>;
}

const UNIT_MB: Record<string, number> = { K: 1 / 1024, M: 1, G: 1024 };
const HOTSPOT_TRANSITION =
  /(\d+(?:\.\d+)?)([KMG])->(\d+(?:\.\d+)?)([KMG])\((\d+(?:\.\d+)?)([KMG])\)/;
const ZGC_TRANSITION = /(\d+(?:\.\d+)?)([KMG])\(\d+%\)->(\d+(?:\.\d+)?)([KMG])\(\d+%\)/;
const UNIFIED_UPTIME = /^\[(\d+(?:\.\d+)?)s\]/;
const LEGACY_UPTIME = /(?:^|: )(\d+(?:\.\d+)?): \[/;
const UNIFIED_PAUSE = /(?:\bPause\b|Allocation Stall).*?(\d+(?:\.\d+)?)ms\s*$/;
const LEGACY_PAUSE = /, (\d+(?:\.\d+)?) secs\]\s*$/;

const COLLECTORS: [RegExp, string][] = [
  [/Using G1|UseG1GC/, "G1"],
  [/Using The Z Garbage Collector|UseZGC/, "ZGC"],
  [/Using Shenandoah|UseShenandoahGC/, "Shenandoah"],
  [/Using Parallel|UseParallel(Old)?GC/, "Parallel"],
  [/Using Serial|UseSerialGC/, "Serial"],
  [/UseConcMarkSweepGC/, "CMS"],
];

function toMb(value: string, unit: string): number {
  return Number(value) * (UNIT_MB[unit] ?? 1);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function parseGcLog(text: string, loadSec: number | null = null): GcSummary {
  const heap: { at: number; mb: number }[] = [];
  const pauses: { at: number; ms: number }[] = [];
  let capacityMb = 0;
  let collector: string | undefined;
  let lastAt = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (!collector) {
      collector = COLLECTORS.find(([pattern]) => pattern.test(line))?.[1];
    }

    const unified = UNIFIED_UPTIME.exec(line);
    const legacy = unified ? null : LEGACY_UPTIME.exec(line);
    const at = unified ? Number(unified[1]) : legacy ? Number(legacy[1]) : lastAt;
    lastAt = at;

    const hotspot = HOTSPOT_TRANSITION.exec(line);
    const zgc = hotspot ? null : ZGC_TRANSITION.exec(line);
    if (hotspot) {
      heap.push({ at, mb: toMb(hotspot[3], hotspot[4]) });
      capacityMb = Math.max(capacityMb, toMb(hotspot[5], hotspot[6]));
    } else if (zgc) {
      heap.push({ at, mb: toMb(zgc[3], zgc[4]) });
    }

    if (/GC\(\d+\) Concurrent|concurrent-/i.test(line)) continue;
    const pause = unified ? UNIFIED_PAUSE.exec(line) : LEGACY_PAUSE.exec(line);
    if (pause) {
      pauses.push({ at, ms: unified ? Number(pause[1]) : Number(pause[1]) * 1000 });
    }
  }

  const afterLoad = <T extends { at: number }>(items: T[]) => {
    if (loadSec === null) return items;
    const settled = items.filter((item) => item.at >= loadSec);
    return settled.length >= 3 ? settled : items;
  };

  const summary: GcSummary = {};
  if (collector) summary.collector = collector;
  if (capacityMb > 0) summary.capacityMb = Math.round(capacityMb);

  const settledHeap = afterLoad(heap).map((item) => item.mb);
  if (settledHeap.length > 0) {
    summary.typicalMb = Math.round(median(settledHeap));
    summary.peakMb = Math.round(Math.max(...settledHeap));
  }

  if (pauses.length > 0) {
    const settledPauses = afterLoad(pauses).map((item) => item.ms);
    summary.pauses = {
      count: settledPauses.length,
      long: settledPauses.filter((ms) => ms >= LONG_PAUSE_MS).length,
      longestMs: Math.round(Math.max(...settledPauses)),
      totalMs: Math.round(settledPauses.reduce((sum, ms) => sum + ms, 0)),
    };
  }

  return summary;
}

export function parseTasklistMemoryMb(output: string): number | null {
  const fields = output.trim().split(/","/);
  if (fields.length < 5) return null;
  const digits = fields[fields.length - 1].replace(/\D/g, "");
  if (!digits) return null;
  return Math.round(Number(digits) / 1024);
}

export function parseProcStatusMemoryMb(status: string): number | null {
  const match = /^VmRSS:\s+(\d+)\s+kB/m.exec(status);
  return match ? Math.round(Number(match[1]) / 1024) : null;
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout: 5000, maxBuffer: 64 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

export async function processMemoryMb(pid: number): Promise<number | null> {
  try {
    if (process.platform === "win32") {
      const tasklist = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tasklist.exe");
      return parseTasklistMemoryMb(
        await run(tasklist, ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]),
      );
    }
    if (process.platform === "linux") {
      return parseProcStatusMemoryMb(await fs.readFile(`/proc/${pid}/status`, "utf-8"));
    }
    const rss = Number((await run("ps", ["-o", "rss=", "-p", String(pid)])).trim());
    return Number.isFinite(rss) && rss > 0 ? Math.round(rss / 1024) : null;
  } catch {
    return null;
  }
}

export class GameMetricsRecorder {
  private readonly startedAt = performance.now();
  private lastAtlasAt: number | null = null;
  private loadMs: number | null = null;
  private readonly memory: number[] = [];
  private timer: NodeJS.Timeout | null = null;
  private sampling = false;
  private finished = false;

  constructor(
    private readonly options: {
      pid: number | undefined;
      gcLogPath: string | null;
      sampleMemory?: (pid: number) => Promise<number | null>;
    },
  ) {}

  start(): void {
    if (!this.options.pid || this.timer) return;
    this.timer = setInterval(() => void this.sample(), SAMPLE_MS);
    this.timer.unref?.();
  }

  line(message: string, now = performance.now()): void {
    if (this.loadMs !== null) return;
    if (this.lastAtlasAt !== null && now - this.lastAtlasAt > LOAD_SETTLE_MS) {
      this.loadMs = this.lastAtlasAt - this.startedAt;
      return;
    }
    if (ATLAS_LINE.test(message)) {
      this.lastAtlasAt = now;
      return;
    }
    if (this.lastAtlasAt !== null && WORLD_START_LINE.test(message)) {
      this.loadMs = this.lastAtlasAt - this.startedAt;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async sample(): Promise<void> {
    const pid = this.options.pid;
    if (!pid || this.sampling || this.finished) return;
    this.sampling = true;
    try {
      const mb = await (this.options.sampleMemory ?? processMemoryMb)(pid);
      if (mb && mb > 0) this.memory.push(mb);
    } finally {
      this.sampling = false;
    }
  }

  async finish(): Promise<ISessionResources | null> {
    this.finished = true;
    this.stop();
    if (this.loadMs === null && this.lastAtlasAt !== null) {
      this.loadMs = this.lastAtlasAt - this.startedAt;
    }
    const loadSec = this.loadMs === null ? null : Math.max(1, Math.round(this.loadMs / 1000));

    let gc: GcSummary = {};
    if (this.options.gcLogPath) {
      try {
        const stat = await fs.stat(this.options.gcLogPath);
        if (stat.size > 0 && stat.size <= MAX_LOG_BYTES) {
          gc = parseGcLog(await fs.readFile(this.options.gcLogPath, "utf-8"), loadSec);
        }
      } catch {}
    }

    const resources: ISessionResources = {};
    if (loadSec !== null) resources.loadSec = loadSec;
    if (gc.collector) resources.gc = gc.collector;
    if (gc.typicalMb !== undefined) resources.heapTypicalMb = gc.typicalMb;
    if (gc.peakMb !== undefined) resources.heapPeakMb = gc.peakMb;
    if (gc.capacityMb !== undefined) resources.heapCapacityMb = gc.capacityMb;
    if (gc.pauses) resources.pauses = gc.pauses;
    if (this.memory.length > 0) {
      resources.processPeakMb = Math.max(...this.memory);
      resources.processTypicalMb = Math.round(median(this.memory));
    }

    return Object.keys(resources).length > 0 ? resources : null;
  }
}
