import { describe, expect, it } from "vitest";
import {
  backupFreshness,
  formatSpawn,
  isWorldNameValid,
  isWorldVersionMismatch,
  nextAvailableName,
  splitDatapacks,
  worldAgeDays,
} from "./worldFacts";

describe("worldAgeDays", () => {
  it("converts ticks into in-game days", () => {
    expect(worldAgeDays(24000 * 7)).toBe(7);
  });

  it("rounds a partial first day up to one", () => {
    expect(worldAgeDays(36)).toBe(1);
  });

  it("returns null for a missing or empty age", () => {
    expect(worldAgeDays(0)).toBeNull();
    expect(worldAgeDays(undefined)).toBeNull();
  });
});

describe("formatSpawn", () => {
  it("renders rounded coordinates", () => {
    expect(formatSpawn({ x: 63.7, y: 79, z: -32.2 })).toBe("64 79 -32");
  });

  it("returns null without a spawn", () => {
    expect(formatSpawn(undefined)).toBeNull();
  });
});

describe("isWorldNameValid", () => {
  it("rejects blank, duplicate and overlong names", () => {
    expect(isWorldNameValid("  ", [])).toBe(false);
    expect(isWorldNameValid("Home", ["Home"])).toBe(false);
    expect(isWorldNameValid("x".repeat(65), [])).toBe(false);
  });

  it("accepts a fresh trimmed name", () => {
    expect(isWorldNameValid("  Home  ", ["Other"])).toBe(true);
  });
});

describe("nextAvailableName", () => {
  it("keeps the desired name when it is free", () => {
    expect(nextAvailableName("Copy of Home", ["Home"])).toBe("Copy of Home");
  });

  it("appends the first free numeric suffix", () => {
    expect(nextAvailableName("Home", ["Home", "Home (2)", "Home (3)"])).toBe(
      "Home (4)",
    );
  });

  it("never exceeds the level name limit", () => {
    const long = "w".repeat(64);
    const result = nextAvailableName(long, [long]);

    expect(result.length).toBeLessThanOrEqual(64);
    expect(result.endsWith(" (2)")).toBe(true);
  });
});

describe("backupFreshness", () => {
  it("reports lost progress when the world moved on after the backup", () => {
    expect(backupFreshness(1_000_000, 1_600_000)).toEqual({
      losesProgress: true,
      deltaMs: 600_000,
    });
  });

  it("treats a backup taken right after the session as lossless", () => {
    expect(backupFreshness(1_600_000, 1_590_000)).toEqual({
      losesProgress: false,
      deltaMs: 10_000,
    });
  });

  it("returns null without both timestamps", () => {
    expect(backupFreshness(0, 5)).toBeNull();
    expect(backupFreshness(5, undefined)).toBeNull();
  });
});

describe("isWorldVersionMismatch", () => {
  it("flags a world saved by another game version", () => {
    expect(isWorldVersionMismatch("1.20.1", "26.2")).toBe(true);
  });

  it("stays quiet when either side is unknown or equal", () => {
    expect(isWorldVersionMismatch("26.2", "26.2")).toBe(false);
    expect(isWorldVersionMismatch(undefined, "26.2")).toBe(false);
    expect(isWorldVersionMismatch("26.2", undefined)).toBe(false);
  });
});

describe("splitDatapacks", () => {
  it("matches level.dat ids against folder entries", () => {
    expect(
      splitDatapacks(
        ["terralith.zip", "extra", "unlisted.zip"],
        ["file/terralith.zip"],
        ["file/extra"],
      ),
    ).toEqual([
      { name: "terralith.zip", state: "enabled" },
      { name: "extra", state: "disabled" },
      { name: "unlisted.zip", state: "unknown" },
    ]);
  });

  it("marks everything unknown without level.dat lists", () => {
    expect(splitDatapacks(["a.zip"])).toEqual([
      { name: "a.zip", state: "unknown" },
    ]);
  });

  it("keeps zips copied into a world the game has not reopened pending", () => {
    expect(
      splitDatapacks(
        [
          "darkblades_trims_datapack_26.x.zip",
          "MES - Biomes O' Plenty Compat Pack-4.5.7.zip",
          "Trek 1.21-26.2 B0.6.2.zip",
        ],
        ["vanilla"],
        ["minecart_improvements", "redstone_experiments", "trade_rebalance"],
      ).every((entry) => entry.state === "unknown"),
    ).toBe(true);
  });
});
