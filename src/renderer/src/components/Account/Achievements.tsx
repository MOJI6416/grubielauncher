import { IUser } from "@/types/IUser";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import pt100 from "@renderer/assets/achievements/pt100.png";
import pt500 from "@renderer/assets/achievements/pt500.png";
import pt1000 from "@renderer/assets/achievements/pt1000.png";
import { CheckCircle2, Clock3, Trophy } from "lucide-react";
import { useMemo } from "react";

type AchievementType = "playtime";

type Achievement = {
  id: string;
  type: AchievementType;
  points: number;
  icon: string;
};

const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: "pt100", type: "playtime", points: 100, icon: pt100 },
  { id: "pt500", type: "playtime", points: 500, icon: pt500 },
  { id: "pt1000", type: "playtime", points: 1000, icon: pt1000 },
];

export function Achievements({
  onClose,
  user,
}: {
  onClose: () => void;
  user: IUser;
}) {
  const { t } = useTranslation();

  const achievedSet = useMemo(
    () => new Set(user.achievements),
    [user.achievements],
  );
  const achievedCount = achievedSet.size;
  const totalCount = ALL_ACHIEVEMENTS.length;
  const overallProgress =
    totalCount > 0 ? (achievedCount / totalCount) * 100 : 0;

  const playtimeHours = useMemo(() => {
    const seconds = typeof user.playTime === "number" ? user.playTime : 0;
    return seconds / 3600;
  }, [user.playTime]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-muted-foreground" />
            {t("achievements.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="grid gap-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t("achievements.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {achievedCount}/{totalCount}
                  </p>
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {Math.round(overallProgress)}%
                </Badge>
              </div>
              <Progress value={overallProgress} max={100} />
            </CardContent>
          </Card>

          <ScrollArea className="max-h-[22rem] pr-2">
            <div className="grid gap-3">
              {ALL_ACHIEVEMENTS.map((achievement) => {
                const achieved = achievedSet.has(achievement.id);

                const progressValue =
                  achievement.type === "playtime" ? playtimeHours : 0;
                const progressPercent = Math.min(
                  100,
                  (progressValue / achievement.points) * 100,
                );
                const currentHours = Math.min(
                  achievement.points,
                  Math.floor(progressValue),
                );

                return (
                  <Card
                    key={achievement.id}
                    className="gap-0 overflow-hidden py-0"
                  >
                    <CardContent className="grid gap-3 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-muted/40 p-2">
                          <img
                            className="max-h-full max-w-full object-contain"
                            draggable={false}
                            src={achievement.icon}
                            alt={t(`achievements.${achievement.id}`)}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {t(`achievements.${achievement.id}`)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {currentHours}/{achievement.points}{" "}
                                {t("time.h")}
                              </p>
                            </div>

                            <Badge
                              variant={achieved ? "default" : "secondary"}
                              className="shrink-0 gap-1 tabular-nums"
                            >
                              {achieved ? (
                                <CheckCircle2 className="size-3" />
                              ) : (
                                <Clock3 className="size-3" />
                              )}
                              {Math.round(progressPercent)}%
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <Progress value={progressPercent} max={100} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
