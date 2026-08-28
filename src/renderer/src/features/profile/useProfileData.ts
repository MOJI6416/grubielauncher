import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { accountAtom, networkAtom } from "@renderer/stores/atoms";
import { EMPTY_ACHIEVEMENT_STATS } from "@/types/Achievements";
import { fetchMergedAchievementStats } from "@renderer/utilities/achievementStats";
import { accountIdentity } from "@renderer/features/accounts/identity";
import { ensureFreshAccount } from "./loadProfileUser";
import { consumeRecentFailure } from "@renderer/utilities/failures";

const api = window.api;

function requireLoaded<T>(value: T | null, channel: string): T | null {
  if (value === null && consumeRecentFailure({ channels: [channel] })) {
    throw new Error(`${channel} did not answer`);
  }

  return value;
}

const REACH_STALE_MS = 10 * 60 * 1000;
const BOARD_STALE_MS = 60 * 1000;

export function useWorldStats(enabled: boolean) {
  const account = useAtomValue(accountAtom);
  const key = account ? accountIdentity(account) : null;

  return useQuery({
    queryKey: ["profile", "world-stats", key],
    enabled: enabled && Boolean(account),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      if (!account) return { stats: EMPTY_ACHIEVEMENT_STATS, partial: false };
      return await fetchMergedAchievementStats(account);
    },
  });
}

export function useAchievementReach() {
  const isBackendOnline = useAtomValue(networkAtom);

  return useQuery({
    queryKey: ["profile", "achievement-reach"],
    enabled: isBackendOnline,
    staleTime: REACH_STALE_MS,
    retry: false,
    queryFn: async () => {
      const data = await api.backend.getAchievementReach();
      if (!data) return null;

      return {
        totalUsers: data.totalUsers,
        percentById: new Map(
          data.achievements.map((entry) => [entry.id, entry.percent]),
        ),
      };
    },
  });
}

export function useGlobalLeaderboard(enabled: boolean) {
  const isBackendOnline = useAtomValue(networkAtom);

  return useQuery({
    queryKey: ["profile", "global-leaderboard"],
    enabled: enabled && isBackendOnline,
    staleTime: BOARD_STALE_MS,
    retry: false,
    queryFn: async () => await api.backend.getGlobalLeaderboard(100),
  });
}

export function useOwnLeaderboardRank(enabled: boolean) {
  const account = useAtomValue(accountAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const key = account ? accountIdentity(account) : null;

  return useQuery({
    queryKey: ["profile", "own-rank", key],
    enabled: enabled && isBackendOnline && account?.type !== "plain",
    staleTime: BOARD_STALE_MS,
    retry: false,
    queryFn: async () => {
      const { account: fresh } = await ensureFreshAccount();
      return requireLoaded(
        await api.backend.getOwnLeaderboardRank(fresh.accessToken || ""),
        "backend:getOwnLeaderboardRank",
      );
    },
  });
}

export function useMutualFriends(userId: string | null) {
  const account = useAtomValue(accountAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const key = account ? accountIdentity(account) : null;

  return useQuery({
    queryKey: ["profile", "mutual-friends", key, userId],
    enabled: Boolean(userId) && isBackendOnline && account?.type !== "plain",
    staleTime: BOARD_STALE_MS,
    retry: false,
    queryFn: async () => {
      const { account: fresh } = await ensureFreshAccount();
      return await api.backend.getMutualFriends(
        fresh.accessToken || "",
        userId ?? "",
      );
    },
  });
}

export class PublicProfileHiddenError extends Error {
  readonly code = "public_profile_hidden";

  constructor() {
    super("Public profile is not published");
    this.name = "PublicProfileHiddenError";
  }
}

export function isPublicProfileHiddenError(
  error: unknown,
): error is PublicProfileHiddenError {
  return error instanceof PublicProfileHiddenError;
}

export function usePublicProfile(
  nickname: string | null,
  userId?: string | null,
) {
  const isBackendOnline = useAtomValue(networkAtom);

  return useQuery({
    queryKey: ["profile", "public", nickname, userId ?? null],
    enabled: Boolean(nickname) && isBackendOnline,
    staleTime: BOARD_STALE_MS,
    retry: false,
    queryFn: async () => {
      const data = await api.backend.getPublicProfile(
        nickname ?? "",
        userId ?? undefined,
      );
      if (data !== null) return data;

      const failure = consumeRecentFailure({
        channels: ["backend:getPublicProfile"],
      });
      if (!failure) return null;
      if (failure.cause === "notFound") throw new PublicProfileHiddenError();

      throw new Error("backend:getPublicProfile did not answer");
    },
  });
}

export function useOwnModpacks(enabled: boolean) {
  const account = useAtomValue(accountAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const key = account ? accountIdentity(account) : null;

  return useQuery({
    queryKey: ["profile", "own-modpacks", key],
    enabled: enabled && isBackendOnline && account?.type !== "plain",
    staleTime: 30 * 1000,
    retry: false,
    queryFn: async () => {
      const { account: fresh } = await ensureFreshAccount();
      const list = await api.backend.getOwnModpacks(fresh.accessToken || "");
      if (!list) throw new Error("own modpacks load failed");
      return list;
    },
  });
}
