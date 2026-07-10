import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  Bug,
  Castle,
  ChevronsUp,
  Clock,
  Compass,
  Crown,
  Feather,
  Fish,
  Flame,
  Gem,
  Globe,
  Hammer,
  HeartCrack,
  Hourglass,
  Map as MapIcon,
  Mountain,
  Pickaxe,
  Rabbit,
  ShieldAlert,
  Skull,
  Sparkles,
  Swords,
  Timer,
  Coins,
  Download,
  Palette,
  Shirt,
  Users,
  Package,
  PackageCheck,
  Boxes,
  Rocket,
  UserPlus,
  UsersRound,
  Mic,
  Headphones,
  AudioLines,
} from "lucide-react";
import { IAchievementStats } from "@/types/Achievements";

export type AchievementCategory =
  | "exploration"
  | "mining"
  | "combat"
  | "survival"
  | "craft"
  | "playtime"
  | "community";

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

type MetricKey = keyof IAchievementStats | "playTimeSeconds";
type MetricUnit = "count" | "km" | "ticksHours" | "secondsHours";

export interface IAchievementDef {
  id: string;
  category: AchievementCategory;
  metric?: MetricKey;
  goal?: number;
  points: number;
  unit?: MetricUnit;
  granted?: boolean;
  icon: LucideIcon;
}

export interface IAchievementProgress {
  def: IAchievementDef;
  value: number;
  unlocked: boolean;
  ratio: number;
  rarity: AchievementRarity;
}

export const CATEGORY_ORDER: AchievementCategory[] = [
  "exploration",
  "mining",
  "combat",
  "survival",
  "craft",
  "playtime",
  "community",
];

export const CATEGORY_ICON: Record<AchievementCategory, LucideIcon> = {
  exploration: Compass,
  mining: Pickaxe,
  combat: Swords,
  survival: HeartCrack,
  craft: Hammer,
  playtime: Hourglass,
  community: Users,
};

const KM = 100_000;
const HOUR_TICKS = 72_000;
const HOUR_SECONDS = 3_600;

export const ACHIEVEMENTS: IAchievementDef[] = [
  { id: "explore_10km", category: "exploration", metric: "distanceCm", goal: 10 * KM, points: 10, unit: "km", icon: MapIcon },
  { id: "explore_100km", category: "exploration", metric: "distanceCm", goal: 100 * KM, points: 25, unit: "km", icon: Compass },
  { id: "explore_1000km", category: "exploration", metric: "distanceCm", goal: 1000 * KM, points: 60, unit: "km", icon: Globe },
  { id: "elytra_50km", category: "exploration", metric: "elytraCm", goal: 50 * KM, points: 40, unit: "km", icon: Feather },
  { id: "worlds_5", category: "exploration", metric: "worlds", goal: 5, points: 15, unit: "count", icon: Mountain },
  { id: "worlds_25", category: "exploration", metric: "worlds", goal: 25, points: 40, unit: "count", icon: Globe },

  { id: "mine_1k", category: "mining", metric: "blocksMined", goal: 1_000, points: 10, unit: "count", icon: Pickaxe },
  { id: "mine_25k", category: "mining", metric: "blocksMined", goal: 25_000, points: 30, unit: "count", icon: Pickaxe },
  { id: "mine_150k", category: "mining", metric: "blocksMined", goal: 150_000, points: 60, unit: "count", icon: Mountain },
  { id: "diamonds_64", category: "mining", metric: "diamondsMined", goal: 64, points: 25, unit: "count", icon: Gem },
  { id: "diamonds_512", category: "mining", metric: "diamondsMined", goal: 512, points: 55, unit: "count", icon: Gem },
  { id: "debris_16", category: "mining", metric: "ancientDebrisMined", goal: 16, points: 45, unit: "count", icon: Flame },

  { id: "kills_250", category: "combat", metric: "mobKills", goal: 250, points: 10, unit: "count", icon: Swords },
  { id: "kills_2500", category: "combat", metric: "mobKills", goal: 2_500, points: 30, unit: "count", icon: Swords },
  { id: "kills_25000", category: "combat", metric: "mobKills", goal: 25_000, points: 65, unit: "count", icon: Skull },
  { id: "dragon", category: "combat", metric: "enderDragonKills", goal: 1, points: 70, unit: "count", icon: Crown },
  { id: "wither_1", category: "combat", metric: "witherKills", goal: 1, points: 50, unit: "count", icon: Bug },
  { id: "wither_10", category: "combat", metric: "witherKills", goal: 10, points: 80, unit: "count", icon: Bug },
  { id: "warden", category: "combat", metric: "wardenKills", goal: 1, points: 90, unit: "count", icon: ShieldAlert },

  { id: "ingame_10h", category: "survival", metric: "playTimeTicks", goal: 10 * HOUR_TICKS, points: 10, unit: "ticksHours", icon: Hourglass },
  { id: "ingame_100h", category: "survival", metric: "playTimeTicks", goal: 100 * HOUR_TICKS, points: 30, unit: "ticksHours", icon: Hourglass },
  { id: "ingame_500h", category: "survival", metric: "playTimeTicks", goal: 500 * HOUR_TICKS, points: 65, unit: "ticksHours", icon: Hourglass },
  { id: "jumps_25k", category: "survival", metric: "jumps", goal: 25_000, points: 20, unit: "count", icon: ChevronsUp },
  { id: "sleep_50", category: "survival", metric: "timesSlept", goal: 50, points: 20, unit: "count", icon: BedDouble },
  { id: "deaths_100", category: "survival", metric: "deaths", goal: 100, points: 25, unit: "count", icon: HeartCrack },

  { id: "craft_1k", category: "craft", metric: "itemsCrafted", goal: 1_000, points: 10, unit: "count", icon: Hammer },
  { id: "craft_10k", category: "craft", metric: "itemsCrafted", goal: 10_000, points: 40, unit: "count", icon: Hammer },
  { id: "enchant_50", category: "craft", metric: "itemsEnchanted", goal: 50, points: 30, unit: "count", icon: Sparkles },
  { id: "trade_100", category: "craft", metric: "villagerTrades", goal: 100, points: 20, unit: "count", icon: Coins },
  { id: "trade_1000", category: "craft", metric: "villagerTrades", goal: 1_000, points: 55, unit: "count", icon: Coins },
  { id: "breed_50", category: "craft", metric: "animalsBred", goal: 50, points: 20, unit: "count", icon: Rabbit },
  { id: "fish_100", category: "craft", metric: "fishCaught", goal: 100, points: 20, unit: "count", icon: Fish },
  { id: "raid_1", category: "craft", metric: "raidsWon", goal: 1, points: 45, unit: "count", icon: Castle },

  { id: "pt100", category: "playtime", metric: "playTimeSeconds", goal: 100 * HOUR_SECONDS, points: 30, unit: "secondsHours", icon: Clock },
  { id: "pt500", category: "playtime", metric: "playTimeSeconds", goal: 500 * HOUR_SECONDS, points: 60, unit: "secondsHours", icon: Hourglass },
  { id: "pt1000", category: "playtime", metric: "playTimeSeconds", goal: 1000 * HOUR_SECONDS, points: 100, unit: "secondsHours", icon: Timer },

  { id: "skin_first", category: "community", points: 20, granted: true, icon: Shirt },
  { id: "skin_author_10", category: "community", points: 45, granted: true, icon: Palette },
  { id: "skin_downloads_100", category: "community", points: 35, granted: true, icon: Download },
  { id: "skin_downloads_1000", category: "community", points: 80, granted: true, icon: Flame },

  { id: "modpack_first", category: "community", points: 15, granted: true, icon: Package },
  { id: "modpack_downloads_5", category: "community", points: 20, granted: true, icon: PackageCheck },
  { id: "modpack_downloads_25", category: "community", points: 35, granted: true, icon: Boxes },
  { id: "modpack_downloads_100", category: "community", points: 55, granted: true, icon: Rocket },
  { id: "friends_10", category: "community", points: 20, granted: true, icon: UserPlus },
  { id: "group_popular", category: "community", points: 30, granted: true, icon: UsersRound },

  { id: "voice_1h", category: "community", points: 15, granted: true, icon: Mic },
  { id: "voice_10h", category: "community", points: 30, granted: true, icon: Headphones },
  { id: "voice_50h", category: "community", points: 55, granted: true, icon: AudioLines },
];

const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievementDef(id: string): IAchievementDef | undefined {
  return ACHIEVEMENTS_BY_ID.get(id);
}

export function rarityOf(points: number): AchievementRarity {
  if (points >= 70) return "legendary";
  if (points >= 45) return "epic";
  if (points >= 25) return "rare";
  return "common";
}

function metricValue(
  metric: MetricKey,
  stats: IAchievementStats,
  playTimeSeconds: number,
): number {
  if (metric === "playTimeSeconds") return playTimeSeconds;
  return stats[metric] ?? 0;
}

export function evaluateAchievements(
  stats: IAchievementStats,
  playTimeSeconds: number,
  earnedIds?: Iterable<string>,
): IAchievementProgress[] {
  const earned = new Set(earnedIds ?? []);
  return ACHIEVEMENTS.map((def) => {
    if (def.granted) {
      const unlocked = earned.has(def.id);
      return {
        def,
        value: 0,
        unlocked,
        ratio: unlocked ? 1 : 0,
        rarity: rarityOf(def.points),
      };
    }
    const value = metricValue(def.metric!, stats, playTimeSeconds);
    const unlocked = value >= def.goal! || earned.has(def.id);
    const ratio = unlocked
      ? 1
      : def.goal! > 0
        ? Math.min(1, value / def.goal!)
        : 0;
    return {
      def,
      value,
      unlocked,
      ratio,
      rarity: rarityOf(def.points),
    };
  });
}

export const POINTS_PER_LEVEL = 200;

export function levelFromPoints(points: number): number {
  return Math.floor(points / POINTS_PER_LEVEL) + 1;
}

export function pointsForAchievements(ids: Iterable<string>): number {
  let points = 0;
  for (const id of ids) {
    const def = ACHIEVEMENTS_BY_ID.get(id);
    if (def) points += def.points;
  }
  return points;
}

export interface ILevelInfo {
  level: number;
  nextLevel: number;
  intoLevel: number;
  levelSpan: number;
  ratio: number;
}

export function levelInfo(points: number): ILevelInfo {
  const level = levelFromPoints(points);
  const intoLevel = points % POINTS_PER_LEVEL;
  return {
    level,
    nextLevel: level + 1,
    intoLevel,
    levelSpan: POINTS_PER_LEVEL,
    ratio: intoLevel / POINTS_PER_LEVEL,
  };
}

export interface ILevelTier {
  key: string;
  ringClass: string;
}

export function levelTier(level: number): ILevelTier {
  if (level >= 8) return { key: "t4", ringClass: "ring-2 ring-primary" };
  if (level >= 6) return { key: "t3", ringClass: "ring-2 ring-primary/70" };
  if (level >= 4) return { key: "t2", ringClass: "ring-2 ring-primary/50" };
  if (level >= 2) return { key: "t1", ringClass: "ring-2 ring-primary/30" };
  return { key: "t0", ringClass: "ring-1 ring-border" };
}

export function metricDisplay(value: number, unit: MetricUnit): number {
  switch (unit) {
    case "km":
      return Math.round((value / KM) * 10) / 10;
    case "ticksHours":
      return Math.floor(value / HOUR_TICKS);
    case "secondsHours":
      return Math.floor(value / HOUR_SECONDS);
    default:
      return Math.floor(value);
  }
}
