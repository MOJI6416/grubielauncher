import { describe, expect, it } from "vitest";
import { runCrashRegexJobs } from "./crashRegexWorker";

describe("runCrashRegexJobs", () => {
  it("answers test jobs against the log text", async () => {
    const run = await runCrashRegexJobs(
      "java.lang.OutOfMemoryError: Java heap space",
      [
        { pattern: "java\\.lang\\.OutOfMemoryError", flags: "i" },
        { pattern: "StackOverflowError", flags: "i" },
        { pattern: "([", flags: "i" },
      ],
      5,
    );

    expect(run).toEqual({ results: [true, false, false], stalledAt: null });
  });

  it("captures culprits, deduplicated and capped", async () => {
    const text = [
      "Mod ID: 'alpha'",
      "Mod ID: 'beta'",
      "Mod ID: 'alpha'",
      "Mod ID: 'gamma'",
    ].join("\n");

    const run = await runCrashRegexJobs(
      text,
      [{ pattern: "Mod ID: '([\\w-]+)'", flags: "gi", capture: true }],
      2,
    );

    expect(run).toEqual({ results: [["alpha", "beta"]], stalledAt: null });
  });

  it("returns nothing at all for an empty job list", async () => {
    expect(await runCrashRegexJobs("anything", [], 5)).toEqual({
      results: [],
      stalledAt: null,
    });
  });

  it("keeps the verdicts that arrived before a job outran the budget, and names that job", async () => {
    const started = Date.now();
    let ticks = 0;
    const heartbeat = setInterval(() => {
      ticks += 1;
    }, 20);

    const run = await runCrashRegexJobs(
      `java.lang.OutOfMemoryError\n${"a".repeat(8000)}`,
      [
        { pattern: "java\\.lang\\.OutOfMemoryError", flags: "i" },
        { pattern: ".*.*.*ZZZQ", flags: "i" },
        { pattern: "StackOverflowError", flags: "i" },
      ],
      5,
      600,
    );

    clearInterval(heartbeat);
    const elapsed = Date.now() - started;

    expect(run.results[0]).toBe(true);
    expect(run.results[1]).toBeNull();
    expect(run.results[2]).toBeNull();
    expect(run.stalledAt).toBe(1);
    expect(elapsed).toBeLessThan(5000);
    expect(ticks).toBeGreaterThan(3);
  });
});
