import { describe, expect, it } from "vitest";
import { MIN_BUSY_MS, holdBusy, remainingBusyMs } from "./busy";

describe("remainingBusyMs", () => {
  it("keeps the button busy until the window is over", () => {
    expect(remainingBusyMs(1000, 1000)).toBe(MIN_BUSY_MS);
    expect(remainingBusyMs(1000, 1200, 600)).toBe(400);
  });

  it("returns zero once the operation outlived the window", () => {
    expect(remainingBusyMs(1000, 1600, 600)).toBe(0);
    expect(remainingBusyMs(1000, 9000, 600)).toBe(0);
  });
});

describe("holdBusy", () => {
  it("resolves immediately for a slow operation", async () => {
    const startedAt = Date.now() - 5000;
    const before = Date.now();

    await holdBusy(startedAt, 600);

    expect(Date.now() - before).toBeLessThan(200);
  });
});
