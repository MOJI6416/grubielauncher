import { IUser } from "@/types/IUser";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAtom } from "jotai";
import { friendsAtom } from "@renderer/stores/atoms";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import {
  levelFromPoints,
  pointsForAchievements,
} from "@renderer/utilities/achievements";

interface Entry {
  id: string;
  nickname: string;
  image: string | null;
  points: number;
  level: number;
  isSelf: boolean;
}

export function Leaderboard({
  onClose,
  user,
}: {
  onClose: () => void;
  user: IUser;
}) {
  const { t, i18n } = useTranslation();
  const [friends] = useAtom(friendsAtom);
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);

  const entries = useMemo<Entry[]>(() => {
    const byId = new Map<string, IUser>();
    byId.set(user._id, user);
    for (const friend of friends) {
      if (friend.user?._id) byId.set(friend.user._id, friend.user);
    }

    return Array.from(byId.values())
      .map((u) => {
        const points = pointsForAchievements(u.achievements ?? []);
        return {
          id: u._id,
          nickname: u.nickname,
          image: u.image,
          points,
          level: levelFromPoints(points),
          isSelf: u._id === user._id,
        };
      })
      .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname));
  }, [user, friends]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-5 text-primary" />
            {t("leaderboard.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1 py-0.5">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                entry.isSelf
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : "bg-card"
              }`}
            >
              <RankBadge rank={index + 1} />
              <Avatar size="sm" className="size-9 border">
                <AvatarImage src={entry.image ?? ""} alt={entry.nickname} />
                <AvatarFallback>
                  {entry.nickname.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {entry.nickname}
                  {entry.isSelf && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t("leaderboard.you")}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("achievements.level")} {entry.level}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-primary">
                  {formatNumber(entry.points)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("achievements.points")}
                </p>
              </div>
            </div>
          ))}

          {friends.length === 0 && (
            <p className="px-1 pt-2 text-center text-xs text-muted-foreground">
              {t("leaderboard.empty")}
            </p>
          )}
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

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? "bg-primary text-primary-foreground"
      : rank === 2
        ? "bg-primary/70 text-primary-foreground"
        : rank === 3
          ? "bg-primary/40 text-primary-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${cls}`}
    >
      {rank}
    </span>
  );
}
