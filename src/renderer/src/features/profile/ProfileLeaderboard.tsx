import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { Crown, Globe, Heart, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { IUser } from "@/types/IUser";
import { friendsAtom, networkAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import {
  ACHIEVEMENTS,
  levelFromPoints,
  resolveAchievementPoints,
} from "@renderer/utilities/achievements";
import {
  LeaderRow,
  buildFriendLeaderboard,
  buildGlobalLeaderboard,
  findSelfRow,
} from "./leaderboardRows";
import { useGlobalLeaderboard, useOwnLeaderboardRank } from "./useProfileData";

export function ProfileLeaderboard({
  user,
  points,
  achievementIds,
}: {
  user: IUser;
  points?: number;
  achievementIds?: readonly string[];
}) {
  const { t, i18n } = useTranslation();
  const friends = useAtomValue(friendsAtom);
  const isBackendOnline = useAtomValue(networkAtom);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);

  const global = useGlobalLeaderboard(true);
  const ownRank = useOwnLeaderboardRank(true);

  const self = useMemo(
    () => ({
      ...user,
      achievementPoints: points ?? user.achievementPoints,
      achievements: achievementIds
        ? [...achievementIds]
        : (user.achievements ?? []),
    }),
    [user, points, achievementIds],
  );

  const friendRows = useMemo(
    () =>
      buildFriendLeaderboard(
        self,
        friends.map((friend) => friend?.user),
        resolveAchievementPoints,
        levelFromPoints,
      ),
    [self, friends],
  );

  const ownTotals = useMemo(
    () => ({
      points: resolveAchievementPoints(self.achievementPoints, self.achievements),
      achievements: self.achievements.length,
      levelOf: levelFromPoints,
    }),
    [self],
  );

  const globalRows = useMemo(
    () =>
      global.data
        ? buildGlobalLeaderboard(global.data.users, user._id, ownTotals)
        : [],
    [global.data, user._id, ownTotals],
  );

  const friendSelf = findSelfRow(friendRows);
  const globalSelf = findSelfRow(globalRows);
  const isGlobalLoading = global.isPending && isBackendOnline;

  const globalFooter = globalSelf
    ? t("leaderboard.yourPlace", { rank: formatNumber(globalSelf.rank) })
    : ownRank.isPending || ownRank.isError
      ? null
      : !ownRank.data
        ? t("leaderboard.outsideTop")
        : ownRank.data.listed
        ? t("leaderboard.yourPlaceOutside", {
            rank: formatNumber(ownRank.data.rank),
            points: formatNumber(
              Math.max(ownRank.data.points, ownTotals.points),
            ),
          })
        : Math.max(ownRank.data.points, ownTotals.points) > 0
          ? t("leaderboard.hiddenFromBoard")
          : t("leaderboard.noPointsYet");

  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-3">
      <BoardPanel
        title={t("leaderboard.scope.friends")}
        icon={Users}
        hint={t("leaderboard.friendsHint")}
        rows={friendRows}
        formatNumber={formatNumber}
        onOpen={(id) => navigate({ name: "profile", userId: id })}
        empty={t("leaderboard.empty")}
        hintBelow={friendRows.length <= 1 ? t("leaderboard.empty") : null}
        footer={
          friendSelf && friendRows.length > 1
            ? t("leaderboard.friendsPlace", {
                rank: formatNumber(friendSelf.rank),
                total: formatNumber(friendRows.length),
              })
            : null
        }
      />

      <BoardPanel
        title={t("leaderboard.scope.global")}
        icon={Globe}
        hint={t("leaderboard.globalHint")}
        rows={globalRows}
        formatNumber={formatNumber}
        onOpen={(id) => navigate({ name: "profile", userId: id })}
        isLoading={isGlobalLoading}
        unavailable={
          !isBackendOnline || (!global.isPending && !global.data)
            ? t("leaderboard.unavailable")
            : null
        }
        empty={t("leaderboard.globalEmpty")}
        action={
          <Hint content={t("common.refresh")}>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={global.isFetching || !isBackendOnline}
              aria-label={t("common.refresh")}
              onClick={() => void global.refetch()}
            >
              <RefreshCw className={global.isFetching ? "animate-spin" : ""} />
            </Button>
          </Hint>
        }
        footer={globalFooter}
      />
    </div>
  );
}

function BoardPanel({
  title,
  icon: Icon,
  hint,
  rows,
  formatNumber,
  empty,
  hintBelow,
  footer,
  action,
  isLoading,
  unavailable,
  onOpen,
}: {
  title: string;
  icon: typeof Users;
  hint: string;
  rows: LeaderRow[];
  formatNumber: (value: number) => string;
  empty: string;
  hintBelow?: string | null;
  footer: string | null;
  action?: ReactNode;
  isLoading?: boolean;
  unavailable?: string | null;
  onOpen?: (id: string) => void;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
      <header className="flex h-7 shrink-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-faint" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h3>
        {action}
      </header>

      <p className="-mt-2 shrink-0 text-[11px] leading-4 text-faint">{hint}</p>

      <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : unavailable ? (
          <PanelMessage text={unavailable} />
        ) : rows.length === 0 ? (
          <PanelMessage text={empty} />
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-1">
            {rows.map((row) => (
              <BoardRow
                key={row.key}
                row={row}
                formatNumber={formatNumber}
                onOpen={row.isSelf || !row.id ? undefined : onOpen}
              />
            ))}
            {hintBelow && (
              <div className="flex min-h-16 flex-1 items-center justify-center rounded-lg border border-dashed border-border px-5 text-center text-xs text-muted-foreground">
                {hintBelow}
              </div>
            )}
          </div>
        )}
      </div>

      {footer && !isLoading && !unavailable && (
        <Hint content={footer} variant="text" truncatedOnly>
          <p className="shrink-0 truncate rounded-lg bg-surface-1 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            {footer}
          </p>
        </Hint>
      )}
    </section>
  );
}

function PanelMessage({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border px-5 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function BoardRow({
  row,
  formatNumber,
  onOpen,
}: {
  row: LeaderRow;
  formatNumber: (value: number) => string;
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(row.id) : undefined}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onOpen(row.id);
            }
          : undefined
      }
      className={`flex h-11 min-w-0 items-center gap-2 rounded-lg px-2 ${
        row.isSelf ? "bg-primary/10 ring-1 ring-primary/30" : "bg-surface-1"
      } ${onOpen ? "cursor-pointer transition-colors hover:bg-surface-3" : ""}`}
    >
      <RankBadge rank={row.rank} />

      <PlayerHead
        user={{
          id: row.id,
          nickname: row.nickname,
          platform: row.platform,
          uuid: row.uuid,
          headUrl: row.headUrl,
        }}
        size={28}
      />

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1 text-xs font-medium">
          <span className="truncate">{row.nickname}</span>
          {row.isDonor && (
            <Heart className="size-2.5 shrink-0 fill-primary text-primary" />
          )}
          {row.isSelf && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {t("leaderboard.you")}
            </span>
          )}
        </p>
        <p className="truncate text-[10px] text-faint">
          {t("achievements.level")} {formatNumber(row.level)} ·{" "}
          {formatNumber(row.achievements)}/{ACHIEVEMENTS.length}
        </p>
      </div>

      <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
        {formatNumber(row.points)}
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] tabular-nums ${
        rank <= 3
          ? "bg-chart-4/15 text-chart-4"
          : "bg-surface-3 text-muted-foreground"
      }`}
    >
      {rank === 1 ? <Crown className="size-3" /> : rank}
    </span>
  );
}
