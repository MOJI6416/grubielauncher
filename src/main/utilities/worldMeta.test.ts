import { describe, expect, it } from "vitest";
import { getWorldSeed, readWorldMeta, stringifyNbtValue } from "./worldMeta";

describe("stringifyNbtValue", () => {
  it("reads a long stored as a low/high pair", () => {
    expect(stringifyNbtValue([0, 1])).toBe("4294967296");
  });

  it("keeps negative longs negative", () => {
    expect(stringifyNbtValue({ low: -1, high: -1 })).toBe("-1");
  });

  it("returns an empty string for unsupported shapes", () => {
    expect(stringifyNbtValue({ foo: 1 })).toBe("");
    expect(stringifyNbtValue(undefined)).toBe("");
  });
});

describe("getWorldSeed", () => {
  it("reads the seed from WorldGenSettings", () => {
    expect(
      getWorldSeed({ Data: { WorldGenSettings: { seed: "-4207" } } }),
    ).toBe("-4207");
  });

  it("falls back to the legacy RandomSeed field", () => {
    expect(getWorldSeed({ Data: { RandomSeed: 12345 } })).toBe("12345");
  });

  it("reads a detached world_gen_settings.dat root", () => {
    expect(getWorldSeed({ seed: "981" })).toBe("981");
  });

  it("returns an empty string when there is no seed", () => {
    expect(getWorldSeed({ Data: { LevelName: "x" } })).toBe("");
  });
});

describe("readWorldMeta", () => {
  it("reads the legacy numeric difficulty and hardcore flag", () => {
    const meta = readWorldMeta({
      Data: {
        GameType: 0,
        Difficulty: 3,
        hardcore: 1,
        allowCommands: 1,
        Time: "48000",
        LastPlayed: "1700000000000",
        DataVersion: 3465,
        Version: { Name: "1.20.1" },
        SpawnX: 8,
        SpawnY: 64,
        SpawnZ: -12,
      },
    });

    expect(meta.gameMode).toBe("survival");
    expect(meta.difficulty).toBe("hard");
    expect(meta.hardcore).toBe(true);
    expect(meta.cheats).toBe(true);
    expect(meta.worldAgeTicks).toBe(48000);
    expect(meta.lastPlayed).toBe(1700000000000);
    expect(meta.dataVersion).toBe(3465);
    expect(meta.versionName).toBe("1.20.1");
    expect(meta.spawn).toEqual({ x: 8, y: 64, z: -12 });
  });

  it("reads the 26.x difficulty_settings block", () => {
    const meta = readWorldMeta({
      Data: {
        GameType: 1,
        difficulty_settings: { difficulty: "normal", hardcore: 0, locked: 0 },
        spawn: { pos: [64, 79, -32], dimension: "minecraft:overworld" },
        Version: { Name: "26.2" },
        DataPacks: { Enabled: ["vanilla"], Disabled: ["trade_rebalance"] },
      },
    });

    expect(meta.gameMode).toBe("creative");
    expect(meta.difficulty).toBe("normal");
    expect(meta.hardcore).toBeUndefined();
    expect(meta.spawn).toEqual({ x: 64, y: 79, z: -32 });
    expect(meta.enabledDatapacks).toEqual(["vanilla"]);
    expect(meta.disabledDatapacks).toEqual(["trade_rebalance"]);
  });

  it("reads the datapack registry of a freshly created 26.2 world", () => {
    const meta = readWorldMeta({
      Data: {
        difficulty_settings: { difficulty: "normal", hardcore: 0, locked: 0 },
        singleplayer_uuid: [-616751661, 1180840486, -1799367252, -2146612723],
        Time: "128",
        GameType: 0,
        ServerBrands: ["fabric"],
        version: 19133,
        LastPlayed: "1786847737237",
        spawn: {
          pos: [64, 79, -32],
          pitch: 0,
          dimension: "minecraft:overworld",
          yaw: 0,
        },
        Version: { Snapshot: 0, Series: "main", Id: 4903, Name: "26.2" },
        LevelName: "Новый мир",
        initialized: 1,
        WasModded: 1,
        DataVersion: 4903,
        allowCommands: 0,
        DataPacks: {
          Enabled: ["vanilla"],
          Disabled: [
            "minecart_improvements",
            "redstone_experiments",
            "trade_rebalance",
          ],
        },
      },
    });

    expect(meta.enabledDatapacks).toEqual(["vanilla"]);
    expect(meta.disabledDatapacks).toEqual([
      "minecart_improvements",
      "redstone_experiments",
      "trade_rebalance",
    ]);
  });

  it("keeps the file/ prefix of registered zip datapacks", () => {
    const meta = readWorldMeta({
      Data: {
        DataPacks: {
          Enabled: ["vanilla", "file/Trek 1.21-26.2 B0.6.2.zip"],
          Disabled: ["file/darkblades_trims_datapack_26.x.zip"],
        },
      },
    });

    expect(meta.enabledDatapacks).toEqual([
      "vanilla",
      "file/Trek 1.21-26.2 B0.6.2.zip",
    ]);
    expect(meta.disabledDatapacks).toEqual([
      "file/darkblades_trims_datapack_26.x.zip",
    ]);
  });

  it("leaves the datapack lists undefined when level.dat has no registry", () => {
    const meta = readWorldMeta({ Data: { LevelName: "x" } });

    expect(meta.enabledDatapacks).toBeUndefined();
    expect(meta.disabledDatapacks).toBeUndefined();
  });

  it("keeps peaceful distinguishable from a missing difficulty", () => {
    expect(readWorldMeta({ Data: { Difficulty: 0 } }).difficulty).toBe(
      "peaceful",
    );
    expect(readWorldMeta({ Data: {} }).difficulty).toBeUndefined();
  });

  it("drops a zero LastPlayed and a zero world age", () => {
    const meta = readWorldMeta({ Data: { LastPlayed: "0", Time: "0" } });

    expect(meta.lastPlayed).toBeUndefined();
    expect(meta.worldAgeTicks).toBeUndefined();
  });

  it("returns an empty object without a Data compound", () => {
    expect(readWorldMeta({})).toEqual({});
    expect(readWorldMeta(null)).toEqual({});
  });
});
