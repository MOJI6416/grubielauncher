import type {
  AchievementCategory,
  AchievementRarity,
  MetricUnit,
} from "@renderer/utilities/achievements";

export type AchievementStatus = "all" | "unlocked" | "locked";
export type AchievementSort = "progress" | "rarity" | "points" | "name";

export const ACHIEVEMENT_SORTS: AchievementSort[] = [
  "progress",
  "rarity",
  "points",
  "name",
];

export interface AchievementProgressInput {
  def: {
    id: string;
    category: AchievementCategory;
    points: number;
    granted?: boolean;
    goal?: number;
    unit?: MetricUnit;
  };
  value: number;
  unlocked: boolean;
  ratio: number;
}

export interface AchievementRow {
  id: string;
  category: AchievementCategory;
  points: number;
  granted: boolean;
  unlocked: boolean;
  ratio: number;
  value: number;
  goal: number;
  unit: MetricUnit | null;
  percent: number | null;
  rarity: AchievementRarity;
}

export interface AchievementFilter {
  category: AchievementCategory | "all";
  status: AchievementStatus;
  query: string;
}

export interface AchievementSummary {
  unlocked: number;
  total: number;
  points: number;
  totalPoints: number;
  completion: number;
}

export interface CategoryTally {
  category: AchievementCategory;
  unlocked: number;
  total: number;
}

export function rarityFromPoints(points: number): AchievementRarity {
  if (points >= 70) return "legendary";
  if (points >= 45) return "epic";
  if (points >= 25) return "rare";
  return "common";
}

export function rarityFromPercent(percent: number): AchievementRarity {
  if (percent <= 1) return "legendary";
  if (percent <= 5) return "epic";
  if (percent <= 20) return "rare";
  return "common";
}

export function buildAchievementRows(
  progress: readonly AchievementProgressInput[],
  reach: ReadonlyMap<string, number> | null,
): AchievementRow[] {
  return progress.map((item) => {
    const percent = reach?.get(item.def.id);
    const hasPercent = typeof percent === "number" && Number.isFinite(percent);

    return {
      id: item.def.id,
      category: item.def.category,
      points: item.def.points,
      granted: item.def.granted === true,
      unlocked: item.unlocked,
      ratio: clampRatio(item.ratio),
      value: item.value,
      goal: item.def.goal ?? 0,
      unit: item.def.unit ?? null,
      percent: hasPercent ? percent : null,
      rarity: hasPercent
        ? rarityFromPercent(percent)
        : rarityFromPoints(item.def.points),
    };
  });
}

export function filterAchievements(
  rows: readonly AchievementRow[],
  filter: AchievementFilter,
  nameOf: (id: string) => string,
): AchievementRow[] {
  const query = filter.query.trim().toLocaleLowerCase();

  return rows.filter((row) => {
    if (filter.category !== "all" && row.category !== filter.category) {
      return false;
    }
    if (filter.status === "unlocked" && !row.unlocked) return false;
    if (filter.status === "locked" && row.unlocked) return false;
    if (query && !nameOf(row.id).toLocaleLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
}

export function sortAchievements(
  rows: readonly AchievementRow[],
  sort: AchievementSort,
  nameOf: (id: string) => string,
): AchievementRow[] {
  const sorted = [...rows];

  if (sort === "name") {
    sorted.sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)));
    return sorted;
  }

  if (sort === "points") {
    sorted.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
    return sorted;
  }

  if (sort === "rarity") {
    sorted.sort(
      (a, b) =>
        rarityWeight(a) - rarityWeight(b) ||
        b.points - a.points ||
        a.id.localeCompare(b.id),
    );
    return sorted;
  }

  sorted.sort(
    (a, b) =>
      chaseWeight(a) - chaseWeight(b) ||
      b.ratio - a.ratio ||
      b.points - a.points ||
      a.id.localeCompare(b.id),
  );
  return sorted;
}

export function summarizeAchievements(
  rows: readonly AchievementRow[],
): AchievementSummary {
  let unlocked = 0;
  let points = 0;
  let totalPoints = 0;

  for (const row of rows) {
    totalPoints += row.points;
    if (!row.unlocked) continue;
    unlocked += 1;
    points += row.points;
  }

  return {
    unlocked,
    total: rows.length,
    points,
    totalPoints,
    completion:
      rows.length > 0 ? Math.round((unlocked / rows.length) * 100) : 0,
  };
}

export interface OwnAchievementTotals {
  points: number;
  catalogIds: string[];
}

export function ownAchievementTotals(
  serverPoints: number | null | undefined,
  serverIds: readonly string[],
  rows: readonly AchievementRow[],
  pointsOf: (ids: readonly string[]) => number,
): OwnAchievementTotals {
  const catalogIds: string[] = [];
  let localPoints = 0;

  for (const row of rows) {
    if (!row.unlocked) continue;
    catalogIds.push(row.id);
    localPoints += row.points;
  }

  const fromServer =
    typeof serverPoints === "number" &&
    Number.isFinite(serverPoints) &&
    serverPoints >= 0
      ? serverPoints
      : pointsOf(serverIds);

  return {
    points: Math.max(fromServer, localPoints),
    catalogIds,
  };
}

export function tallyByCategory(
  rows: readonly AchievementRow[],
  order: readonly AchievementCategory[],
): CategoryTally[] {
  const tally = new Map<AchievementCategory, CategoryTally>();

  for (const category of order) {
    tally.set(category, { category, unlocked: 0, total: 0 });
  }

  for (const row of rows) {
    const entry = tally.get(row.category);
    if (!entry) continue;
    entry.total += 1;
    if (row.unlocked) entry.unlocked += 1;
  }

  return order.map((category) => tally.get(category)!);
}

export function pickShowcase(
  rows: readonly AchievementRow[],
  limit = 6,
): AchievementRow[] {
  return rows
    .filter((row) => row.unlocked)
    .sort(
      (a, b) =>
        rarityWeight(a) - rarityWeight(b) ||
        b.points - a.points ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

export function pickAlmostThere(
  rows: readonly AchievementRow[],
  limit = 4,
): AchievementRow[] {
  return rows
    .filter((row) => !row.unlocked && !row.granted && row.goal > 0)
    .sort(
      (a, b) =>
        chaseWeight(a) - chaseWeight(b) ||
        b.ratio - a.ratio ||
        b.points - a.points ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

export function achievementDescriptionKey(
  id: string,
  isOwner: boolean,
): string {
  return `achievements.items.${id}.${isOwner ? "desc" : "descOther"}`;
}

export function displayMetric(value: number, unit: MetricUnit | null): number {
  switch (unit) {
    case "km":
      return Math.round((value / 100_000) * 10) / 10;
    case "ticksHours":
      return Math.floor(value / 72_000);
    case "secondsHours":
      return Math.floor(value / 3_600);
    default:
      return Math.floor(value);
  }
}

export function remainingToGoal(row: AchievementRow): number {
  if (row.unlocked || row.granted) return 0;
  const left = displayMetric(row.goal, row.unit) - displayMetric(row.value, row.unit);
  return left > 0 ? Math.round(left * 10) / 10 : 0;
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

function rarityWeight(row: AchievementRow): number {
  if (row.percent !== null) return row.percent;
  return 100 - Math.min(100, row.points);
}

function chaseWeight(row: AchievementRow): number {
  if (row.unlocked) return 2;
  if (row.ratio > 0) return 0;
  return 1;
}
