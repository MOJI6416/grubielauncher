import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_ACHIEVEMENT_STATS,
  IAchievementStats,
} from "@/types/Achievements";
import type { ILocalAccount } from "@/types/Account";

const loadAchievementStats = vi.fn();
const getRemoteStats = vi.fn();

vi.stubGlobal("window", {
  api: {
    worlds: { loadAchievementStats },
    backend: { getRemoteStats },
  },
});

const { fetchMergedAchievementStats, WorldStatsUnreadableError } = await import(
  "./achievementStats"
);
const { pushIpcFailure } = await import("./failures");

const account = {
  type: "discord",
  nickname: "Lumavia",
  accessToken: "token",
} as unknown as ILocalAccount;

const withMobKills = (value: number): IAchievementStats => ({
  ...EMPTY_ACHIEVEMENT_STATS,
  mobKills: value,
});

describe("fetchMergedAchievementStats", () => {
  beforeEach(() => {
    loadAchievementStats.mockReset();
    getRemoteStats.mockReset();
  });

  it("throws when local statistics cannot be read", async () => {
    loadAchievementStats.mockResolvedValue(null);
    await expect(fetchMergedAchievementStats(account)).rejects.toBeInstanceOf(
      WorldStatsUnreadableError,
    );
  });

  it("merges remote worlds the local disk does not know", async () => {
    loadAchievementStats.mockResolvedValue({
      stats: withMobKills(10),
      worldKeys: ["local"],
    });
    getRemoteStats.mockResolvedValue({
      worlds: [
        { worldKey: "local", stats: withMobKills(10) },
        { worldKey: "friend", stats: withMobKills(7) },
      ],
    });

    const result = await fetchMergedAchievementStats(account);
    expect(result.stats.mobKills).toBe(17);
    expect(result.partial).toBe(false);
  });

  it("marks the result partial when the remote read fails behind the empty fallback", async () => {
    loadAchievementStats.mockResolvedValue({
      stats: withMobKills(10),
      worldKeys: ["local"],
    });
    getRemoteStats.mockImplementation(async () => {
      pushIpcFailure({
        code: "APP-OFFLINE",
        side: "launcher",
        cause: "offline",
        channel: "backend:getRemoteStats",
        message: "stand: offline",
        time: Date.now(),
      });
      return { worlds: [] };
    });

    const result = await fetchMergedAchievementStats(account);
    expect(result.stats.mobKills).toBe(10);
    expect(result.partial).toBe(true);
  });

  it("does not cry partial over an honestly empty remote answer", async () => {
    loadAchievementStats.mockResolvedValue({
      stats: withMobKills(10),
      worldKeys: ["local"],
    });
    getRemoteStats.mockResolvedValue({ worlds: [] });

    const result = await fetchMergedAchievementStats(account);
    expect(result.partial).toBe(false);
  });

  it("marks the result partial when the remote call throws", async () => {
    loadAchievementStats.mockResolvedValue({
      stats: withMobKills(10),
      worldKeys: [],
    });
    getRemoteStats.mockRejectedValue(new Error("boom"));

    const result = await fetchMergedAchievementStats(account);
    expect(result.partial).toBe(true);
  });

  it("keeps the disk-level partial flag when there is no token", async () => {
    loadAchievementStats.mockResolvedValue({
      stats: withMobKills(3),
      worldKeys: [],
      partial: true,
    });

    const result = await fetchMergedAchievementStats({
      ...account,
      accessToken: "",
    } as ILocalAccount);
    expect(result.partial).toBe(true);
    expect(getRemoteStats).not.toHaveBeenCalled();
  });
});
