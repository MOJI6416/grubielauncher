export type LeaderPlatform = "microsoft" | "elyby" | "discord";

export interface LeaderRow {
  key: string;
  id: string;
  rank: number;
  nickname: string;
  headUrl: string | null;
  platform: LeaderPlatform | null;
  uuid: string | null;
  points: number;
  level: number;
  achievements: number;
  isDonor: boolean;
  isSelf: boolean;
}

export interface LeaderCandidate {
  _id: string;
  nickname: string;
  platform?: LeaderPlatform;
  uuid?: string;
  achievements?: string[];
  achievementPoints?: number;
  isDonor?: boolean;
}

export interface GlobalLeaderEntry {
  rank: number;
  id: string;
  nickname: string;
  headUrl: string | null;
  points: number;
  level: number;
  achievementsCount: number;
  isDonor: boolean;
}

export function buildFriendLeaderboard(
  self: LeaderCandidate,
  friends: readonly (LeaderCandidate | null | undefined)[],
  pointsOf: (server: number | undefined, ids: readonly string[]) => number,
  levelOf: (points: number) => number,
): LeaderRow[] {
  const byId = new Map<string, LeaderCandidate>();
  byId.set(self._id, self);

  for (const friend of friends) {
    if (!friend?._id || byId.has(friend._id)) continue;
    byId.set(friend._id, friend);
  }

  return [...byId.values()]
    .map((candidate) => {
      const achievements = candidate.achievements ?? [];
      const points = pointsOf(candidate.achievementPoints, achievements);

      return {
        key: candidate._id,
        id: candidate._id,
        rank: 0,
        nickname: candidate.nickname,
        headUrl: null,
        platform: candidate.platform ?? null,
        uuid: candidate.uuid ?? null,
        points,
        level: levelOf(points),
        achievements: achievements.length,
        isDonor: candidate.isDonor === true,
        isSelf: candidate._id === self._id,
      };
    })
    .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export interface OwnBoardTotals {
  points: number;
  achievements: number;
  levelOf: (points: number) => number;
}

export function buildGlobalLeaderboard(
  entries: readonly GlobalLeaderEntry[],
  selfId: string,
  own?: OwnBoardTotals,
): LeaderRow[] {
  return entries.map((entry) => {
    const isSelf = !!entry.id && !!selfId && entry.id === selfId;
    const points = isSelf && own ? Math.max(entry.points, own.points) : entry.points;

    return {
      key: entry.id || `${entry.rank}-${entry.nickname}`,
      id: entry.id,
      rank: entry.rank,
      nickname: entry.nickname,
      headUrl: entry.headUrl,
      platform: null,
      uuid: null,
      points,
      level: isSelf && own ? own.levelOf(points) : entry.level,
      achievements:
        isSelf && own
          ? Math.max(entry.achievementsCount, own.achievements)
          : entry.achievementsCount,
      isDonor: entry.isDonor,
      isSelf,
    };
  });
}

export function findSelfRow(rows: readonly LeaderRow[]): LeaderRow | null {
  return rows.find((row) => row.isSelf) ?? null;
}
