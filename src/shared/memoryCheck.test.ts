import { describe, expect, it } from "vitest";
import { memoryShortfall, parseMemAvailable } from "./memoryCheck";

const GB = 1024 * 1024 * 1024;

describe("parseMemAvailable", () => {
  it("reads MemAvailable, not MemFree", () => {
    const meminfo = [
      "MemTotal:       16314628 kB",
      "MemFree:          812344 kB",
      "MemAvailable:    6291456 kB",
      "Buffers:          123456 kB",
    ].join("\n");

    expect(parseMemAvailable(meminfo)).toBe(6 * GB);
  });

  it("returns null on kernels without the field", () => {
    expect(parseMemAvailable("MemTotal: 1 kB\nMemFree: 1 kB")).toBeNull();
  });
});

describe("memoryShortfall", () => {
  it("warns when less is free than the game gets", () => {
    expect(
      memoryShortfall({ allocatedMb: 6144, availableBytes: 3.5 * GB }),
    ).toEqual({ allocatedMb: 6144, availableMb: 3584 });
  });

  it("stays quiet when there is enough or nothing is known", () => {
    expect(memoryShortfall({ allocatedMb: 4096, availableBytes: 4 * GB })).toBe(
      null,
    );
    expect(memoryShortfall({ allocatedMb: 4096, availableBytes: null })).toBe(
      null,
    );
    expect(memoryShortfall({ allocatedMb: 4096, availableBytes: 0 })).toBe(null);
  });
});
