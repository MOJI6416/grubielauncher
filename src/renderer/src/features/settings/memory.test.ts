import { describe, expect, it } from "vitest";
import {
  activePresetId,
  clampMemory,
  maxMemoryMb,
  memoryAdvice,
  memoryArgsPreview,
  memoryPresets,
  memoryTicks,
  tickOffset,
  toTotalMemoryMb,
} from "./memory";

describe("toTotalMemoryMb", () => {
  it("converts bytes to whole megabytes", () => {
    expect(toTotalMemoryMb(16 * 1024 * 1024 * 1024)).toBe(16384);
  });

  it("returns zero when the value is unusable", () => {
    expect(toTotalMemoryMb(0)).toBe(0);
    expect(toTotalMemoryMb(Number.NaN)).toBe(0);
    expect(toTotalMemoryMb(-1)).toBe(0);
  });
});

describe("maxMemoryMb", () => {
  it("reserves 2 GB for the system", () => {
    expect(maxMemoryMb(16384)).toBe(14336);
  });

  it("never drops below the minimum", () => {
    expect(maxMemoryMb(2048)).toBe(1024);
  });

  it("falls back when total memory is unknown", () => {
    expect(maxMemoryMb(0)).toBe(32768);
  });
});

describe("clampMemory", () => {
  it("snaps to the 512 MB step", () => {
    expect(clampMemory(3000, 16384)).toBe(3072);
  });

  it("clamps to the machine ceiling", () => {
    expect(clampMemory(60000, 8192)).toBe(6144);
  });

  it("clamps to the floor", () => {
    expect(clampMemory(16, 16384)).toBe(1024);
    expect(clampMemory(Number.NaN, 16384)).toBe(1024);
  });
});

describe("memoryPresets", () => {
  it("scales with the machine and stays under the ceiling", () => {
    const presets = memoryPresets(16384);

    expect(presets.map((preset) => preset.id)).toEqual([
      "vanilla",
      "light",
      "modpack",
      "heavy",
    ]);
    expect(presets.map((preset) => preset.mb)).toEqual([2048, 3584, 5632, 7168]);
    for (const preset of presets) {
      expect(preset.mb).toBeLessThanOrEqual(maxMemoryMb(16384));
    }
  });

  it("collapses duplicates on small machines", () => {
    const presets = memoryPresets(4096);

    expect(presets).toEqual([
      { id: "vanilla", mb: 1024 },
      { id: "modpack", mb: 1536 },
      { id: "heavy", mb: 2048 },
    ]);
  });

  it("uses fixed targets when total memory is unknown", () => {
    expect(memoryPresets(0).map((preset) => preset.mb)).toEqual([
      2048, 4096, 6144, 10240,
    ]);
  });
});

describe("activePresetId", () => {
  it("matches the preset with the same allocation", () => {
    expect(activePresetId(2048, 16384)).toBe("vanilla");
    expect(activePresetId(5632, 16384)).toBe("modpack");
  });

  it("returns null for a custom value", () => {
    expect(activePresetId(5120, 16384)).toBeNull();
  });
});

describe("memoryAdvice", () => {
  it("returns nothing without machine data", () => {
    expect(memoryAdvice(4096, 0, true)).toBeNull();
  });

  it("flags a critical allocation regardless of jvm flags", () => {
    expect(memoryAdvice(15360, 16384, false)).toMatchObject({
      tone: "danger",
      key: "critical",
    });
  });

  it("flags a tight allocation only with preallocation on", () => {
    expect(memoryAdvice(10240, 12288, true)).toMatchObject({ key: "tight" });
    expect(memoryAdvice(10240, 12288, false)).toMatchObject({ key: "balanced" });
  });

  it("warns about pointlessly large heaps", () => {
    expect(memoryAdvice(12288, 65536, true)).toMatchObject({
      key: "excessive",
      headroomMb: 53248,
    });
  });

  it("reports the remaining headroom", () => {
    expect(memoryAdvice(4096, 16384, true)).toEqual({
      tone: "info",
      key: "balanced",
      headroomMb: 12288,
    });
  });
});

describe("memoryTicks", () => {
  it("marks the powers of two that fit on the machine", () => {
    expect(memoryTicks(16384)).toEqual([2048, 4096, 8192]);
    expect(memoryTicks(65536)).toEqual([2048, 4096, 8192, 16384, 32768]);
  });

  it("returns nothing when the ceiling is below the first tick", () => {
    expect(memoryTicks(4096)).toEqual([2048]);
    expect(memoryTicks(3072)).toEqual([]);
  });
});

describe("tickOffset", () => {
  it("maps a tick onto the slider track", () => {
    expect(tickOffset(1024, 16384)).toBe(0);
    expect(tickOffset(14336, 16384)).toBe(100);
    expect(Math.round(tickOffset(8192, 16384))).toBe(54);
  });

  it("does not divide by zero on a tiny machine", () => {
    expect(tickOffset(2048, 2048)).toBe(0);
  });
});

describe("memoryArgsPreview", () => {
  it("preallocates the whole heap with optimized flags", () => {
    expect(memoryArgsPreview(6144, true)).toBe("-Xms6144M -Xmx6144M");
  });

  it("starts small without them", () => {
    expect(memoryArgsPreview(6144, false)).toBe("-Xms1G -Xmx6144M");
  });
});
