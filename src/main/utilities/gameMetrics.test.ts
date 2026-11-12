import { describe, expect, it } from "vitest";
import {
  GameMetricsRecorder,
  gcLogArguments,
  parseGcLog,
  parseProcStatusMemoryMb,
  parseTasklistMemoryMb,
} from "./gameMetrics";

const G1 = `[0.063s] Using G1
[0.328s] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 31M->15M(256M) 3.069ms
[1.857s] GC(10) Pause Young (Concurrent Start) (Metadata GC Threshold) 111M->63M(154M) 4.820ms
[1.857s] GC(11) Concurrent Mark Cycle
[1.884s] GC(11) Concurrent Mark Cycle 26.591ms
[1.878s] GC(11) Pause Remark 67M->67M(154M) 2.925ms
[1.884s] GC(11) Pause Cleanup 68M->68M(154M) 0.019ms
[40.000s] GC(12) Pause Young (Normal) (G1 Evacuation Pause) 2048M->1200M(6144M) 12.5ms
[80.000s] GC(13) Pause Young (Mixed) (G1 Evacuation Pause) 2100M->1300M(6144M) 140.25ms
[120.000s] GC(14) Pause Full (G1 Compaction Pause) 5000M->1400M(6144M) 320ms`;

const ZGC = `[0.017s] Using The Z Garbage Collector
[0.186s] GC(0) Major Collection (Warmup)
[0.190s] GC(0) Major Collection (Warmup) 18M(11%)->16M(10%) 0.004s
[0.806s] GC(4) Minor Collection (Allocation Rate) 98M(61%)->92M(57%) 0.052s
[4.144s] Allocation Stall (Worker-Main-1) 0.471ms`;

const SHENANDOAH = `[0.010s] Using Shenandoah
[0.215s] GC(0) Pause Init Mark (unload classes) 0.014ms
[0.218s] GC(0) Pause Final Mark (unload classes) 0.370ms
[0.219s] GC(0) Concurrent cleanup (unload classes) 43M->37M(160M) 0.007ms`;

const JAVA8_PARALLEL = `OpenJDK 64-Bit Server VM (25.402-b06) for windows-amd64 JRE (1.8.0_402-b06)
CommandLine flags: -XX:InitialHeapSize=1073741824 -XX:MaxHeapSize=4294967296 -XX:+PrintGC -XX:+PrintGCTimeStamps -XX:+UseParallelGC
0.512: [GC (Allocation Failure)  262144K->18208K(1005056K), 0.0171531 secs]
3.456: [Full GC (Ergonomics)  1200000K->900000K(3500000K), 0.4000000 secs]`;

const JAVA8_G1 = `CommandLine flags: -XX:+UseG1GC -XX:+PrintGC
0.415: [GC pause (G1 Evacuation Pause) (young) 24M->4096K(256M), 0.0045000 secs]
1.200: [GC concurrent-mark-start]
1.300: [GC concurrent-mark-end, 0.0123000 secs]
1.310: [GC remark 100M->100M(256M), 0.0010000 secs]`;

describe("gcLogArguments", () => {
  it("uses unified logging from Java 9 and -Xloggc before it", () => {
    expect(gcLogArguments({ javaMajor: 21, javaVendor: "Eclipse Adoptium", jvm: [] })).toEqual([
      "-Xlog:gc:file=logs/grubie-gc.log:uptime:filecount=0",
    ]);
    expect(gcLogArguments({ javaMajor: 8, javaVendor: "Azul", jvm: [] })).toEqual([
      "-Xloggc:logs/grubie-gc.log",
    ]);
  });

  it("stays out of the way of OpenJ9 and of the player's own GC logging", () => {
    expect(gcLogArguments({ javaMajor: 17, javaVendor: "IBM Semeru", jvm: [] })).toEqual([]);
    expect(gcLogArguments({ javaMajor: 17, javaVendor: null, jvm: ["-Xlog:gc*"] })).toEqual([]);
    expect(gcLogArguments({ javaMajor: 8, javaVendor: null, jvm: ["-verbose:gc"] })).toEqual([]);
    expect(gcLogArguments({ javaMajor: null, javaVendor: null, jvm: [] })).toEqual([]);
  });
});

describe("parseGcLog", () => {
  it("reads G1: heap after collections, pauses, the collector", () => {
    const summary = parseGcLog(G1, 30);
    expect(summary.collector).toBe("G1");
    expect(summary.capacityMb).toBe(6144);
    expect(summary.typicalMb).toBe(1300);
    expect(summary.peakMb).toBe(1400);
    expect(summary.pauses).toEqual({ count: 3, long: 2, longestMs: 320, totalMs: 473 });
  });

  it("counts the concurrent-start young pause but not the concurrent cycle", () => {
    const summary = parseGcLog(G1);
    expect(summary.pauses?.count).toBe(7);
  });

  it("reads ZGC transitions and allocation stalls", () => {
    const summary = parseGcLog(ZGC);
    expect(summary.collector).toBe("ZGC");
    expect(summary.peakMb).toBe(92);
    expect(summary.capacityMb).toBeUndefined();
    expect(summary.pauses).toEqual({ count: 1, long: 0, longestMs: 0, totalMs: 0 });
  });

  it("reads Shenandoah pauses and its heap after cleanup", () => {
    const summary = parseGcLog(SHENANDOAH);
    expect(summary.collector).toBe("Shenandoah");
    expect(summary.peakMb).toBe(37);
    expect(summary.pauses?.count).toBe(2);
  });

  it("reads Java 8 logs in kilobytes and seconds", () => {
    const parallel = parseGcLog(JAVA8_PARALLEL);
    expect(parallel.collector).toBe("Parallel");
    expect(parallel.peakMb).toBe(879);
    expect(parallel.capacityMb).toBe(3418);
    expect(parallel.pauses).toEqual({ count: 2, long: 1, longestMs: 400, totalMs: 417 });

    const g1 = parseGcLog(JAVA8_G1);
    expect(g1.collector).toBe("G1");
    expect(g1.pauses?.count).toBe(2);
  });

  it("returns nothing for an empty log", () => {
    expect(parseGcLog("")).toEqual({});
  });
});

describe("process memory", () => {
  it("reads tasklist CSV in any locale grouping", () => {
    expect(parseTasklistMemoryMb('"javaw.exe","9120","Console","1","4,567,890 K"')).toBe(4461);
    expect(parseTasklistMemoryMb('"javaw.exe","9120","Console","1","4 567 890 K"')).toBe(4461);
    expect(parseTasklistMemoryMb("INFO: No tasks are running which match the specified criteria.")).toBeNull();
  });

  it("reads VmRSS from /proc", () => {
    expect(parseProcStatusMemoryMb("Name:\tjava\nVmRSS:\t 2097152 kB\n")).toBe(2048);
    expect(parseProcStatusMemoryMb("Name:\tjava\n")).toBeNull();
  });
});

describe("GameMetricsRecorder", () => {
  const atlas = "[04:56:14] [Render thread/INFO]: Created: 2048x2048x4 minecraft:textures/atlas/blocks.png-atlas";

  it("takes the end of the first atlas burst as the load time", async () => {
    const recorder = new GameMetricsRecorder({ pid: undefined, gcLogPath: null });
    const start = performance.now();
    recorder.line("[main/INFO]: Loading 129 mods:", start + 1000);
    recorder.line(atlas, start + 40_000);
    recorder.line(atlas, start + 42_000);
    recorder.line("[Server thread/INFO]: Starting integrated minecraft server version 1.21.1", start + 90_000);
    recorder.line(atlas, start + 120_000);
    expect((await recorder.finish())?.loadSec).toBe(42);
  });

  it("stops waiting once the atlases settle", async () => {
    const recorder = new GameMetricsRecorder({ pid: undefined, gcLogPath: null });
    const start = performance.now();
    recorder.line(atlas, start + 30_000);
    recorder.line("[Render thread/INFO]: idle", start + 45_000);
    recorder.line(atlas, start + 300_000);
    expect((await recorder.finish())?.loadSec).toBe(30);
  });

  it("has nothing to report when nothing was measured", async () => {
    const recorder = new GameMetricsRecorder({ pid: undefined, gcLogPath: null });
    expect(await recorder.finish()).toBeNull();
  });
});
