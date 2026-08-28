import { ILocalAccount } from "@/types/Account";
import {
  IAchievementStats,
  EMPTY_ACHIEVEMENT_STATS,
  addAchievementStats,
} from "@/types/Achievements";
import { consumeRecentFailure } from "./failures";

const api = window.api;

export class WorldStatsUnreadableError extends Error {
  readonly code = "world_stats_unreadable";

  constructor() {
    super("World statistics could not be read from disk");
    this.name = "WorldStatsUnreadableError";
  }
}

export interface MergedAchievementStats {
  stats: IAchievementStats;
  partial: boolean;
}

export async function fetchMergedAchievementStats(
  account: ILocalAccount,
): Promise<MergedAchievementStats> {
  const local = await api.worlds.loadAchievementStats(account);
  if (!local) throw new WorldStatsUnreadableError();

  let merged: IAchievementStats = {
    ...(local.stats ?? EMPTY_ACHIEVEMENT_STATS),
  };

  let partial = local.partial === true;

  const token = account.accessToken;
  if (!token) return { stats: merged, partial };

  try {
    const remote = await api.backend.getRemoteStats(token);
    const worlds = remote?.worlds ?? [];

    if (
      worlds.length === 0 &&
      (!remote ||
        consumeRecentFailure({ channels: ["backend:getRemoteStats"] }))
    ) {
      partial = true;
    } else {
      const localKeys = new Set(local.worldKeys ?? []);
      for (const world of worlds) {
        if (localKeys.has(world.worldKey)) continue;
        merged = addAchievementStats(merged, world.stats);
      }
    }
  } catch {
    partial = true;
  }

  return { stats: merged, partial };
}
