import type { LucideIcon } from "lucide-react";
import { Trophy } from "lucide-react";
import type { AchievementDifficulty } from "@renderer/utilities/achievements";
import { getAchievementDef } from "@renderer/utilities/achievements";

export const DIFFICULTY_TEXT: Record<AchievementDifficulty, string> = {
  easy: "text-faint",
  medium: "text-chart-2",
  hard: "text-chart-5",
  legendary: "text-chart-4",
};

export const DIFFICULTY_TILE: Record<AchievementDifficulty, string> = {
  easy: "border-border bg-surface-3 text-muted-foreground",
  medium: "border-chart-2/35 bg-chart-2/10 text-chart-2",
  hard: "border-chart-5/35 bg-chart-5/10 text-chart-5",
  legendary: "border-chart-4/40 bg-chart-4/10 text-chart-4",
};

export function achievementIcon(id: string): LucideIcon {
  return getAchievementDef(id)?.icon ?? Trophy;
}
