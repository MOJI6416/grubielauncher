import { ILocalAccount } from "@/types/Account";
import {
  IAchievementStats,
  EMPTY_ACHIEVEMENT_STATS,
  addAchievementStats,
} from "@/types/Achievements";

const api = window.api;

export async function fetchMergedAchievementStats(
  account: ILocalAccount,
): Promise<IAchievementStats> {
  const local = await api.worlds.loadAchievementStats(account);
  let merged: IAchievementStats = {
    ...(local?.stats ?? EMPTY_ACHIEVEMENT_STATS),
  };

  const token = account.accessToken;
  if (!token) return merged;

  try {
    const remote = await api.backend.getRemoteStats(token);
    const localKeys = new Set(local?.worldKeys ?? []);
    for (const world of remote?.worlds ?? []) {
      if (localKeys.has(world.worldKey)) continue;
      merged = addAchievementStats(merged, world.stats);
    }
  } catch {}

  return merged;
}
