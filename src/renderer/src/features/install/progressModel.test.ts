import { describe, expect, it } from "vitest";
import {
  EMPTY_BATCH_TOTAL,
  accumulateBatch,
  appendStageEvent,
  batchTotalValue,
  buildDownloadStats,
  buildStageRows,
  clampPercent,
  estimateEta,
  formatByteRange,
  formatElapsed,
  formatSeconds,
  paceStageLog,
  sealStageLog,
  stagePlan,
  smoothSpeed,
  stageElapsed,
  stripGroupPrefix,
} from "./progressModel";

const UNITS = ["s", "m", "h", "d"];

describe("clampPercent", () => {
  it("rounds and clamps", () => {
    expect(clampPercent(42.4)).toBe(42);
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(180)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(undefined)).toBe(0);
  });
});

describe("appendStageEvent", () => {
  it("keeps the log untouched while the stage repeats", () => {
    const first = appendStageEvent([], "preparing", 1000);
    const second = appendStageEvent(first, "preparing", 2000);

    expect(second).toBe(first);
    expect(second).toHaveLength(1);
  });

  it("closes the previous stage when a new one starts", () => {
    let log = appendStageEvent([], "preparing", 1000);
    log = appendStageEvent(log, "manifest", 1500);

    expect(log).toHaveLength(2);
    expect(log[0].endedAt).toBe(1500);
    expect(log[1]).toEqual({ stage: "manifest", startedAt: 1500 });
  });

  it("records a stage that comes back later as a separate entry", () => {
    let log = appendStageEvent([], "files", 0);
    log = appendStageEvent(log, "mods", 100);
    log = appendStageEvent(log, "files", 200);

    expect(log.map((entry) => entry.stage)).toEqual(["files", "mods", "files"]);
  });

  it("caps the log length", () => {
    let log: ReturnType<typeof appendStageEvent> = [];
    for (let index = 0; index < 40; index++) {
      log = appendStageEvent(log, index % 2 ? "files" : "mods", index);
    }

    expect(log).toHaveLength(20);
    expect(log[log.length - 1].startedAt).toBe(39);
  });
});

describe("sealStageLog", () => {
  it("closes a trailing open stage once", () => {
    const log = appendStageEvent([], "assets", 500);
    const sealed = sealStageLog(log, 900);

    expect(sealed[0].endedAt).toBe(900);
    expect(sealStageLog(sealed, 1200)).toBe(sealed);
  });

  it("ignores an empty log", () => {
    const empty: ReturnType<typeof appendStageEvent> = [];
    expect(sealStageLog(empty, 10)).toBe(empty);
  });
});

describe("stageElapsed", () => {
  it("uses now for an open stage and endedAt for a closed one", () => {
    expect(stageElapsed({ stage: "java", startedAt: 100 }, 900)).toBe(800);
    expect(
      stageElapsed({ stage: "java", startedAt: 100, endedAt: 400 }, 900),
    ).toBe(300);
  });
});

describe("smoothSpeed", () => {
  it("takes the first usable sample as-is", () => {
    expect(smoothSpeed(null, 1000)).toBe(1000);
    expect(smoothSpeed(0, 1000)).toBe(1000);
  });

  it("keeps the previous value for missing or zero samples", () => {
    expect(smoothSpeed(500, 0)).toBe(500);
    expect(smoothSpeed(500, undefined)).toBe(500);
    expect(smoothSpeed(500, Number.NaN)).toBe(500);
    expect(smoothSpeed(null, 0)).toBeNull();
  });

  it("moves towards the sample without jumping to it", () => {
    const next = smoothSpeed(1000, 2000, 0.5);
    expect(next).toBe(1500);
  });
});

describe("estimateEta", () => {
  const base = {
    totalItems: 10,
    completedItems: 5,
    failedItems: 0,
    progressPercent: 50,
    totalBytes: 0,
    downloadedBytes: 0,
  };

  it("prefers bytes and smoothed speed", () => {
    expect(
      estimateEta(
        { ...base, totalBytes: 10_000, downloadedBytes: 2_000 },
        1_000,
      ),
    ).toBe(8);
  });

  it("returns zero when nothing is left", () => {
    expect(
      estimateEta(
        { ...base, totalBytes: 10_000, downloadedBytes: 10_000 },
        1_000,
      ),
    ).toBe(0);
  });

  it("falls back to the value reported by main", () => {
    expect(estimateEta({ ...base, estimatedTimeRemaining: 42.4 }, null)).toBe(
      42,
    );
    expect(
      estimateEta({ ...base, estimatedTimeRemaining: 0 }, null),
    ).toBeNull();
    expect(estimateEta(null, 100)).toBeNull();
  });
});

describe("buildDownloadStats", () => {
  it("returns null without items", () => {
    expect(buildDownloadStats(null)).toBeNull();
    expect(
      buildDownloadStats({
        totalItems: 0,
        completedItems: 0,
        failedItems: 0,
        progressPercent: 0,
        totalBytes: 0,
        downloadedBytes: 0,
      }),
    ).toBeNull();
  });

  it("uses bytes when sizes are known", () => {
    const stats = buildDownloadStats({
      totalItems: 4,
      completedItems: 1,
      failedItems: 0,
      progressPercent: 25,
      totalBytes: 1000,
      downloadedBytes: 750,
    });

    expect(stats?.percent).toBe(75);
  });

  it("falls back to item counts when sizes are unknown", () => {
    const stats = buildDownloadStats({
      totalItems: 4,
      completedItems: 1,
      failedItems: 2,
      progressPercent: 0,
      totalBytes: 0,
      downloadedBytes: 0,
    });

    expect(stats?.percent).toBe(25);
    expect(stats?.failed).toBe(2);
  });
});

describe("accumulateBatch", () => {
  it("follows a growing counter inside one batch", () => {
    let total = accumulateBatch(EMPTY_BATCH_TOTAL, 100, 312);
    total = accumulateBatch(total, 400, 312);

    expect(batchTotalValue(total)).toBe(400);
  });

  it("never double-counts when the counter dips inside one batch", () => {
    let total = accumulateBatch(EMPTY_BATCH_TOTAL, 500, 312);
    total = accumulateBatch(total, 20, 312);
    total = accumulateBatch(total, 60, 312);

    expect(batchTotalValue(total)).toBe(500);
  });

  it("carries the finished batch over when a new batch starts", () => {
    let total = accumulateBatch(EMPTY_BATCH_TOTAL, 500, 312);
    total = accumulateBatch(total, 20, 8);
    total = accumulateBatch(total, 60, 8);

    expect(batchTotalValue(total)).toBe(560);
  });

  it("ignores broken values", () => {
    const base = { carried: 10, current: 5, key: 1 };
    expect(accumulateBatch(base, Number.NaN, 1)).toBe(base);
    expect(accumulateBatch(base, -3, 1)).toBe(base);
  });
});

describe("stripGroupPrefix", () => {
  it("removes the downloader group prefix", () => {
    expect(stripGroupPrefix("[mods] sodium-0.6.13.jar")).toBe(
      "sodium-0.6.13.jar",
    );
    expect(stripGroupPrefix("plain.jar")).toBe("plain.jar");
    expect(stripGroupPrefix("[mods]")).toBe("[mods]");
    expect(stripGroupPrefix(undefined)).toBe("");
  });
});

describe("formatByteRange", () => {
  const SIZES = ["B", "KB", "MB", "GB", "TB"];

  it("prints the unit once, picked from the total", () => {
    expect(formatByteRange(221_000_000, 566_000_000, SIZES)).toBe(
      "211 / 540 MB",
    );
  });

  it("keeps one decimal for small numbers", () => {
    expect(formatByteRange(1_500_000, 8_400_000, SIZES)).toBe("1.4 / 8 MB");
  });

  it("survives a zero total", () => {
    expect(formatByteRange(0, 0, SIZES)).toBe("0 / 0 B");
  });
});

describe("formatSeconds", () => {
  it("formats by magnitude", () => {
    expect(formatSeconds(9, UNITS)).toBe("9s");
    expect(formatSeconds(95, UNITS)).toBe("1m 35s");
    expect(formatSeconds(3725, UNITS)).toBe("1h 2m");
    expect(formatSeconds(-1, UNITS)).toBe("");
  });
});

describe("formatElapsed", () => {
  it("keeps one decimal under ten seconds", () => {
    expect(formatElapsed(430, UNITS)).toBe("0.4s");
    expect(formatElapsed(9400, UNITS)).toBe("9.4s");
    expect(formatElapsed(65000, UNITS)).toBe("1m 5s");
  });

  it("says nothing for a stage that took no measurable time", () => {
    expect(formatElapsed(0, UNITS)).toBe("");
    expect(formatElapsed(40, UNITS)).toBe("");
    expect(formatElapsed(Number.NaN, UNITS)).toBe("");
  });
});

describe("paceStageLog", () => {
  const instant = [
    { stage: "preparing" as const, startedAt: 1000, endedAt: 1005 },
    { stage: "manifest" as const, startedAt: 1005, endedAt: 1008 },
    { stage: "java" as const, startedAt: 1008 },
  ];

  it("shows only the first stage while the others are still owed screen time", () => {
    const { visible, nextAt } = paceStageLog(instant, 1100, 400);

    expect(visible.map((event) => event.stage)).toEqual(["preparing"]);
    expect(visible[0].running).toBe(true);
    expect(nextAt).toBe(1400);
  });

  it("releases the next stage once the minimum has passed", () => {
    const { visible } = paceStageLog(instant, 1450, 400);

    expect(visible.map((event) => event.stage)).toEqual([
      "preparing",
      "manifest",
    ]);
    expect(visible[0].running).toBe(false);
    expect(visible[1].running).toBe(true);
  });

  it("catches up with reality when a stage takes longer than the minimum", () => {
    const log = [
      { stage: "preparing" as const, startedAt: 1000, endedAt: 1005 },
      { stage: "assets" as const, startedAt: 1005, endedAt: 9000 },
      { stage: "files" as const, startedAt: 9000 },
    ];

    const { visible, nextAt } = paceStageLog(log, 9100, 400);

    expect(visible.map((event) => event.stage)).toEqual([
      "preparing",
      "assets",
      "files",
    ]);
    expect(visible[2].running).toBe(true);
    expect(nextAt).toBeNull();
  });

  it("never asks to wake up in the past", () => {
    const { nextAt } = paceStageLog(instant, 5000, 400);
    expect(nextAt).toBeNull();
  });

  it("survives an empty log", () => {
    expect(paceStageLog([], 1000, 400)).toEqual({ visible: [], nextAt: null });
  });
});

describe("buildStageRows", () => {
  const plan = stagePlan("install");

  it("shows the whole plan while only the first stage has started", () => {
    const rows = buildStageRows(
      [{ stage: "preparing", startedAt: 1000, running: true }],
      plan,
    );

    expect(rows.map((row) => row.stage)).toEqual(plan);
    expect(rows.map((row) => row.state)).toEqual([
      "running",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("keeps the row count stable as stages complete", () => {
    const rows = buildStageRows(
      [
        { stage: "preparing", startedAt: 1000, endedAt: 1500, running: false },
        { stage: "manifest", startedAt: 1500, running: true },
      ],
      plan,
    );

    expect(rows).toHaveLength(plan.length);
    expect(rows[0].state).toBe("done");
    expect(rows[1].state).toBe("running");
    expect(rows[2].state).toBe("pending");
  });

  it("splices unplanned stages in where they happened", () => {
    const rows = buildStageRows(
      [
        { stage: "preparing", startedAt: 1000, endedAt: 1500, running: false },
        { stage: "manifest", startedAt: 1500, endedAt: 1900, running: false },
        { stage: "java", startedAt: 1900, endedAt: 2400, running: false },
        { stage: "loader", startedAt: 2400, endedAt: 2900, running: false },
        { stage: "installer", startedAt: 2900, running: true },
      ],
      plan,
    );

    expect(rows.map((row) => row.stage)).toEqual([
      "preparing",
      "manifest",
      "java",
      "loader",
      "installer",
      "assets",
      "files",
    ]);
    expect(rows[4].state).toBe("running");
    expect(rows[6].state).toBe("pending");
  });

  it("does not repeat a plan row that already happened", () => {
    const rows = buildStageRows(
      [
        { stage: "preparing", startedAt: 1000, endedAt: 1500, running: false },
        { stage: "manifest", startedAt: 1500, endedAt: 1900, running: false },
        { stage: "java", startedAt: 1900, endedAt: 2400, running: false },
        { stage: "loader", startedAt: 2400, endedAt: 2900, running: false },
        { stage: "assets", startedAt: 2900, endedAt: 3400, running: false },
        { stage: "files", startedAt: 3400, endedAt: 9000, running: false },
        { stage: "done", startedAt: 9000, running: true },
      ],
      plan,
    );

    expect(rows.map((row) => row.stage)).toEqual([...plan, "done"]);
    expect(rows.filter((row) => row.state === "pending")).toHaveLength(0);
  });

  it("uses the server order for a server install", () => {
    expect(stagePlan("server")).toEqual([
      "preparing",
      "java",
      "files",
      "installer",
      "loader",
    ]);
  });
});
