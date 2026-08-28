import { describe, expect, it } from "vitest";
import {
  TaskRecord,
  patchLatestOutcome,
  pushTaskRecord,
  resolveOutcome,
  shouldCelebrate,
  taskDuration,
  worstOutcome,
} from "./taskHistory";

function record(id: string, overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    versionName: `Instance ${id}`,
    loaderName: "fabric",
    operation: "install",
    outcome: "done",
    startedAt: 0,
    finishedAt: 60_000,
    bytes: 1024,
    files: 10,
    failedFiles: 0,
    ...overrides,
  };
}

describe("resolveOutcome", () => {
  it("prefers cancellation over everything", () => {
    expect(resolveOutcome({ cancelled: true, failedFiles: 3 })).toBe(
      "cancelled",
    );
  });

  it("distinguishes a clean finish from a partial one", () => {
    expect(resolveOutcome({ cancelled: false, failedFiles: 0 })).toBe("done");
    expect(resolveOutcome({ cancelled: false, failedFiles: 2 })).toBe(
      "partial",
    );
  });
});

describe("worstOutcome", () => {
  it("keeps the most alarming of the two", () => {
    expect(worstOutcome("done", "partial")).toBe("partial");
    expect(worstOutcome("cancelled", "partial")).toBe("cancelled");
    expect(worstOutcome("failed", "cancelled")).toBe("failed");
    expect(worstOutcome("done", "done")).toBe("done");
  });
});

describe("pushTaskRecord", () => {
  it("puts the newest record first", () => {
    const history = pushTaskRecord(pushTaskRecord([], record("a")), record("b"));
    expect(history.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("merges the follow-up operation of the same instance into one entry", () => {
    const first = record("a", {
      versionName: "Vanilla 26.2",
      startedAt: 0,
      finishedAt: 10_000,
      bytes: 100,
      files: 5,
    });
    const second = record("b", {
      versionName: "Vanilla 26.2",
      operation: "install",
      startedAt: 10_500,
      finishedAt: 12_000,
      bytes: 40,
      files: 2,
      failedFiles: 1,
      outcome: "partial",
    });

    const history = pushTaskRecord(pushTaskRecord([], first), second);

    expect(history).toHaveLength(1);
    expect(history[0].id).toBe("a");
    expect(history[0].startedAt).toBe(0);
    expect(history[0].finishedAt).toBe(12_000);
    expect(history[0].bytes).toBe(140);
    expect(history[0].files).toBe(7);
    expect(history[0].failedFiles).toBe(1);
    expect(history[0].outcome).toBe("partial");
  });

  it("does not merge when the gap is too large", () => {
    const first = record("a", {
      versionName: "Vanilla 26.2",
      finishedAt: 10_000,
    });
    const second = record("b", {
      versionName: "Vanilla 26.2",
      startedAt: 60_000,
      finishedAt: 61_000,
    });

    expect(pushTaskRecord(pushTaskRecord([], first), second)).toHaveLength(2);
  });

  it("respects the limit", () => {
    let history: TaskRecord[] = [];
    for (let index = 0; index < 10; index++) {
      history = pushTaskRecord(
        history,
        record(String(index), { startedAt: index * 100_000 }),
        3,
      );
    }

    expect(history.map((item) => item.id)).toEqual(["9", "8", "7"]);
  });
});

describe("patchLatestOutcome", () => {
  it("rewrites the outcome of the record that just landed", () => {
    const history = patchLatestOutcome(
      [record("a", { finishedAt: 1000 })],
      "failed",
      2000,
    );

    expect(history[0].outcome).toBe("failed");
  });

  it("leaves older records alone", () => {
    const history = [record("a", { finishedAt: 1000 })];
    expect(patchLatestOutcome(history, "failed", 50_000)).toBe(history);
  });

  it("does nothing when the outcome already matches or history is empty", () => {
    const history = [record("a", { finishedAt: 1000, outcome: "failed" })];
    expect(patchLatestOutcome(history, "failed", 1500)).toBe(history);
    expect(patchLatestOutcome([], "failed", 1500)).toEqual([]);
  });
});

describe("taskDuration", () => {
  it("never returns a negative duration", () => {
    expect(taskDuration(record("a"))).toBe(60_000);
    expect(taskDuration(record("a", { startedAt: 100, finishedAt: 0 }))).toBe(
      0,
    );
  });
});

describe("shouldCelebrate", () => {
  it("only celebrates a clean install that actually took time", () => {
    expect(shouldCelebrate(record("a"))).toBe(true);
    expect(shouldCelebrate(record("a", { finishedAt: 4000 }))).toBe(false);
    expect(shouldCelebrate(record("a", { outcome: "partial" }))).toBe(false);
  });
});
