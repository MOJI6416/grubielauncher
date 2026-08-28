import type { LucideIcon } from "lucide-react";
import { Trophy } from "lucide-react";
import type { AchievementRarity } from "@renderer/utilities/achievements";
import { getAchievementDef } from "@renderer/utilities/achievements";

export const RARITY_TEXT: Record<AchievementRarity, string> = {
  common: "text-faint",
  rare: "text-chart-2",
  epic: "text-chart-5",
  legendary: "text-chart-4",
};

export const RARITY_TILE: Record<AchievementRarity, string> = {
  common: "border-border bg-surface-3 text-muted-foreground",
  rare: "border-chart-2/35 bg-chart-2/10 text-chart-2",
  epic: "border-chart-5/35 bg-chart-5/10 text-chart-5",
  legendary: "border-chart-4/40 bg-chart-4/10 text-chart-4",
};

export function achievementIcon(id: string): LucideIcon {
  return getAchievementDef(id)?.icon ?? Trophy;
}
