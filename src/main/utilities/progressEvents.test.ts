import { describe, expect, it } from "vitest";
import { ProgressUpdate, throttleProgress } from "./progressEvents";

function collect(intervalMs = 100) {
  let time = 0;
  const sent: ProgressUpdate[] = [];
  const update = throttleProgress<ProgressUpdate>(
    (progress) => sent.push(progress),
    intervalMs,
    () => time,
  );

  return {
    sent,
    at: (next: number, progress: ProgressUpdate) => {
      time = next;
      update(progress);
    },
  };
}

describe("throttleProgress", () => {
  it("drops updates that arrive faster than the interval", () => {
    const { sent, at } = collect();

    at(0, { processedBytes: 1, totalBytes: 10 });
    at(40, { processedBytes: 2, totalBytes: 10 });
    at(99, { processedBytes: 3, totalBytes: 10 });
    at(100, { processedBytes: 4, totalBytes: 10 });

    expect(sent.map((progress) => progress.processedBytes)).toEqual([1, 4]);
  });

  it("always delivers the final update", () => {
    const { sent, at } = collect();

    at(0, { processedBytes: 1, totalBytes: 10 });
    at(10, { processedBytes: 10, totalBytes: 10 });

    expect(sent.map((progress) => progress.processedBytes)).toEqual([1, 10]);
  });

  it("delivers the first update of a new phase right away", () => {
    const { sent, at } = collect();

    at(0, { phase: "archiving", processedBytes: 5, totalBytes: 10 });
    at(20, { phase: "extracting", processedBytes: 0, totalBytes: 30 });

    expect(sent.map((progress) => progress.phase)).toEqual([
      "archiving",
      "extracting",
    ]);
  });
});
