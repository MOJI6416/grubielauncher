import { IWorldStatistics } from "@/types/World";


export interface IWorldStatEntry {
  name: string;
  count: number;
}

export interface IWorldDisplayStats {
  hasData: boolean;
  playTimeTicks: number;
  deaths: number;
  mobKills: number;
  playerKills: number;
  jumps: number;
  damageDealt: number;
  damageTaken: number;
  distanceCm: number;
  blocksMined: number;
  itemsCrafted: number;
  timesSlept: number;
  topMined: IWorldStatEntry[];
  topKilled: IWorldStatEntry[];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function custom(
  stats: Record<string, Record<string, number>>,
  key: string,
): number {
  return num(stats["minecraft:custom"]?.[`minecraft:${key}`]);
}

function sumCategory(category: Record<string, number> | undefined): number {
  if (!category) return 0;
  let total = 0;
  for (const value of Object.values(category)) total += num(value);
  return total;
}

function sumDistance(custom: Record<string, number> | undefined): number {
  if (!custom) return 0;
  let total = 0;
  for (const [key, value] of Object.entries(custom)) {
    if (key.endsWith("_one_cm")) total += num(value);
  }
  return total;
}

function prettify(key: string): string {
  const id = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function topEntries(
  category: Record<string, number> | undefined,
  limit: number,
): IWorldStatEntry[] {
  if (!category) return [];
  return Object.entries(category)
    .map(([key, value]) => ({ name: prettify(key), count: num(value) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function worldDisplayStats(
  statistics?: IWorldStatistics,
): IWorldDisplayStats {
  const stats = statistics?.stats;
  if (!stats) {
    return {
      hasData: false,
      playTimeTicks: 0,
      deaths: 0,
      mobKills: 0,
      playerKills: 0,
      jumps: 0,
      damageDealt: 0,
      damageTaken: 0,
      distanceCm: 0,
      blocksMined: 0,
      itemsCrafted: 0,
      timesSlept: 0,
      topMined: [],
      topKilled: [],
    };
  }

  const customStats = stats["minecraft:custom"];

  return {
    hasData: true,
    playTimeTicks: custom(stats, "play_time"),
    deaths: custom(stats, "deaths"),
    mobKills: custom(stats, "mob_kills"),
    playerKills: custom(stats, "player_kills"),
    jumps: custom(stats, "jump"),
    damageDealt: Math.round(custom(stats, "damage_dealt") / 10),
    damageTaken: Math.round(custom(stats, "damage_taken") / 10),
    distanceCm: sumDistance(customStats),
    blocksMined: sumCategory(stats["minecraft:mined"]),
    itemsCrafted: sumCategory(stats["minecraft:crafted"]),
    timesSlept: custom(stats, "sleep_in_bed"),
    topMined: topEntries(stats["minecraft:mined"], 5),
    topKilled: topEntries(stats["minecraft:killed"], 5),
  };
}
