import { describe, expect, it } from "vitest";
import {
  describePingError,
  latencyBars,
  latencyTone,
  runWithConcurrency,
} from "./ping";

describe("describePingError", () => {
  it("names the socket failures a player can act on", () => {
    expect(describePingError("getaddrinfo ENOTFOUND play.example.net")).toBe(
      "dns",
    );
    expect(describePingError("connect ECONNREFUSED 127.0.0.1:25565")).toBe(
      "refused",
    );
    expect(describePingError("timeout")).toBe("timeout");
    expect(describePingError("connect ETIMEDOUT 1.2.3.4:25565")).toBe("timeout");
    expect(describePingError("bad_response")).toBe("badResponse");
    expect(describePingError("something else")).toBe("unknown");
    expect(describePingError(undefined)).toBe("unknown");
  });
});

describe("latencyBars", () => {
  it("uses the vanilla thresholds", () => {
    expect(latencyBars(0)).toBe(5);
    expect(latencyBars(149)).toBe(5);
    expect(latencyBars(150)).toBe(4);
    expect(latencyBars(299)).toBe(4);
    expect(latencyBars(300)).toBe(3);
    expect(latencyBars(599)).toBe(3);
    expect(latencyBars(600)).toBe(2);
    expect(latencyBars(999)).toBe(2);
    expect(latencyBars(1000)).toBe(1);
  });

  it("returns no bars for an unknown latency", () => {
    expect(latencyBars(undefined)).toBe(0);
    expect(latencyBars(-1)).toBe(0);
  });
});

describe("latencyTone", () => {
  it("splits playable, laggy and hopeless latencies", () => {
    expect(latencyTone(0)).toBe("success");
    expect(latencyTone(119)).toBe("success");
    expect(latencyTone(120)).toBe("warning");
    expect(latencyTone(249)).toBe("warning");
    expect(latencyTone(250)).toBe("destructive");
    expect(latencyTone(undefined)).toBe("destructive");
  });
});

describe("runWithConcurrency", () => {
  it("keeps the result order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;

    const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("streams every result as soon as it is ready", async () => {
    const seen: number[] = [];
    const gates = new Map<number, () => void>();
    const pending = new Map<number, Promise<void>>();

    for (const value of [3, 1, 2]) {
      pending.set(
        value,
        new Promise<void>((resolve) => gates.set(value, resolve)),
      );
    }

    const run = runWithConcurrency(
      [3, 1, 2],
      3,
      async (value) => {
        await pending.get(value)!;
        return value;
      },
      (_, result) => seen.push(result),
    );

    for (const value of [1, 2, 3]) {
      gates.get(value)!();
      await new Promise((resolve) => setImmediate(resolve));
    }

    await run;

    expect(seen).toEqual([1, 2, 3]);
  });

  it("handles an empty list", async () => {
    expect(await runWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
