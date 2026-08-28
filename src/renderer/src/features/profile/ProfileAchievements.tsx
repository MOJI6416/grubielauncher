import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Lock, RefreshCw, Search, Trophy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@renderer/components/Hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IUser } from "@/types/IUser";
import {
  EMPTY_ACHIEVEMENT_STATS,
  IAchievementStats,
} from "@/types/Achievements";
import {
  AchievementRarity,
  CATEGORY_ICON,
  CATEGORY_ORDER,
  evaluateAchievements,
} from "@renderer/utilities/achievements";
import {
  AchievementRow,
  AchievementSort,
  AchievementStatus,
  ACHIEVEMENT_SORTS,
  achievementDescriptionKey,
  buildAchievementRows,
  displayMetric,
  filterAchievements,
  sortAchievements,
  summarizeAchievements,
  tallyByCategory,
} from "./achievementRows";
import {
  RARITY_TEXT,
  RARITY_TILE,
  achievementIcon,
} from "./achievementVisuals";
import { reachPercentParts } from "./profileMetrics";
import { ensureFreshAccount } from "./loadProfileUser";

const api = window.api;

const RARITY_ORDER: AchievementRarity[] = [
  "legendary",
  "epic",
  "rare",
  "common",
];

export function useAchievementRows(
  user: IUser,
  stats: IAchievementStats | undefined,
  reach: ReadonlyMap<string, number> | null,
): AchievementRow[] {
  return useMemo(
    () =>
      buildAchievementRows(
        evaluateAchievements(
          stats ?? EMPTY_ACHIEVEMENT_STATS,
          user.playTime,
          user.achievements ?? [],
        ),
        reach,
      ),
    [stats, reach, user.playTime, user.achievements],
  );
}

export function ProfileAchievements({
  rows,
  isOwner,
  isLoading,
  statsFailed,
  statsPartial,
  onRetryStats,
  totalPlayers,
}: {
  rows: AchievementRow[];
  isOwner: boolean;
  isLoading: boolean;
  statsFailed?: boolean;
  statsPartial?: boolean;
  onRetryStats?: () => void;
  totalPlayers: number | null;
}) {
  const { t, i18n } = useTranslation();

  const [category, setCategory] = useState<
    "all" | (typeof CATEGORY_ORDER)[number]
  >("all");
  const [status, setStatus] = useState<AchievementStatus>("all");
  const [sort, setSort] = useState<AchievementSort>(
    isOwner ? "progress" : "rarity",
  );
  const [query, setQuery] = useState("");

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);
  const nameOf = (id: string) => t(`achievements.items.${id}.name`);

  const summary = useMemo(() => summarizeAchievements(rows), [rows]);
  const tally = useMemo(() => tallyByCategory(rows, CATEGORY_ORDER), [rows]);

  const rarityCounts = useMemo(() => {
    const counts = new Map<
      AchievementRarity,
      { unlocked: number; total: number }
    >();
    for (const row of rows) {
      const entry = counts.get(row.rarity) ?? { unlocked: 0, total: 0 };
      entry.total += 1;
      if (row.unlocked) entry.unlocked += 1;
      counts.set(row.rarity, entry);
    }
    return counts;
  }, [rows]);

  const visible = useMemo(
    () =>
      sortAchievements(
        filterAchievements(rows, { category, status, query }, nameOf),
        sort,
        nameOf,
      ),
    [rows, category, status, query, sort, i18n.resolvedLanguage],
  );

  const isFiltered =
    category !== "all" || status !== "all" || query.trim() !== "";

  const resetFilters = () => {
    setCategory("all");
    setStatus("all");
    setQuery("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
        <CompletionRing value={summary.completion} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {t("achievements.unlockedOf", {
              unlocked: formatNumber(summary.unlocked),
              total: formatNumber(summary.total),
            })}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {t("achievements.pointsOf", {
              points: formatNumber(summary.points),
              total: formatNumber(summary.totalPoints),
            })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {RARITY_ORDER.map((rarity) => {
            const entry = rarityCounts.get(rarity) ?? { unlocked: 0, total: 0 };

            return (
              <Hint
                key={rarity}
                content={
                  totalPlayers
                    ? `${t("achievements.rarityUnlocked", {
                        rarity: t(`achievements.rarity.${rarity}`),
                      })} · ${t("achievements.reachHint", {
                        players: formatNumber(totalPlayers),
                      })}`
                    : t("achievements.rarityUnlocked", {
                        rarity: t(`achievements.rarity.${rarity}`),
                      })
                }
              >
                <div className="flex h-11 w-16 flex-col items-center justify-center rounded-lg bg-surface-1">
                  <span
                    className={`font-mono text-sm tabular-nums ${RARITY_TEXT[rarity]}`}
                  >
                    {formatNumber(entry.unlocked)}
                    <span className="text-faint">
                      /{formatNumber(entry.total)}
                    </span>
                  </span>
                  <span className="text-[10px] text-faint">
                    {t(`achievements.rarity.${rarity}`)}
                  </span>
                </div>
              </Hint>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("achievements.search")}
              className="h-9 pl-8"
            />
          </div>

          <div className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg bg-surface-1 p-1">
            {(["all", "unlocked", "locked"] as AchievementStatus[]).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-surface-3 aria-pressed:text-foreground"
                >
                  {t(`achievements.filter.${value}`)}
                </button>
              ),
            )}
          </div>

          <Select
            value={sort}
            onValueChange={(value) => setSort(value as AchievementSort)}
          >
            <SelectTrigger className="w-40 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACHIEVEMENT_SORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`achievements.sort.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          onWheel={(event) => {
            if (event.deltaY === 0) return;
            event.currentTarget.scrollLeft += event.deltaY;
          }}
        >
          <CategoryChip
            active={category === "all"}
            onClick={() => setCategory("all")}
            label={t("achievements.filter.all")}
            title={t("achievements.filter.all")}
            count={summary.unlocked}
            total={summary.total}
          />
          {tally.map((entry) => {
            const Icon = CATEGORY_ICON[entry.category];
            return (
              <CategoryChip
                key={entry.category}
                active={category === entry.category}
                onClick={() => setCategory(entry.category)}
                title={t(`achievements.categories.${entry.category}`)}
                count={entry.unlocked}
                total={entry.total}
                icon={<Icon className="size-3.5" />}
              />
            );
          })}
        </div>
      </div>

      {(statsFailed || statsPartial) && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-warning/40 bg-surface-2 px-3 py-2">
          <TriangleAlert className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">
            {statsFailed
              ? t("profile.worldStatsFailed")
              : t("profile.worldStatsPartial")}
          </p>
          {onRetryStats && (
            <Button
              variant="secondary"
              size="xs"
              className="shrink-0"
              onClick={onRetryStats}
            >
              <RefreshCw />
              {t("common.retry")}
            </Button>
          )}
        </div>
      )}

      <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p className="text-sm">{t("achievements.loading")}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            {t("achievements.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((row) => (
              <AchievementCard
                key={row.id}
                row={row}
                isOwner={isOwner}
                showProgress={isOwner}
                formatNumber={formatNumber}
              />
            ))}
          </div>
        )}
      </div>

      {isFiltered && !isLoading && (
        <div className="flex h-9 shrink-0 items-center gap-3 rounded-lg bg-surface-1 px-3">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {t("achievements.filtered", {
              shown: formatNumber(visible.length),
              total: formatNumber(rows.length),
            })}
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto shrink-0 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("achievements.resetFilters")}
          </button>
        </div>
      )}
    </div>
  );
}

export function useSyncUnlocked(
  user: IUser,
  unlockedIds: readonly string[],
  enabled: boolean,
  onSynced?: (user: IUser) => void,
): void {
  const sentRef = useRef<string>("");
  const syncedRef = useRef(onSynced);
  syncedRef.current = onSynced;

  useEffect(() => {
    if (!enabled) return;

    const owned = new Set(user.achievements ?? []);
    const missing = unlockedIds.filter((id) => !owned.has(id));
    if (missing.length === 0) return;

    const signature = [...unlockedIds].join(",");
    if (sentRef.current === signature) return;
    sentRef.current = signature;

    let cancelled = false;
    void (async () => {
      try {
        const { account, sub } = await ensureFreshAccount();
        if (cancelled) return;
        if (sub !== user._id) {
          sentRef.current = "";
          return;
        }
        const saved = await api.backend.updateUser(
          account.accessToken || "",
          user._id,
          { achievements: [...unlockedIds] },
        );
        if (cancelled) return;
        if (!saved) {
          sentRef.current = "";
          return;
        }
        syncedRef.current?.(saved);
      } catch {
        sentRef.current = "";
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, unlockedIds, user._id, user.achievements]);
}

function CompletionRing({ value }: { value: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset =
    circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="relative size-11 shrink-0">
      <svg viewBox="0 0 44 44" className="size-11 -rotate-90">
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-surface-3"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold tabular-nums">
        {value}%
      </span>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  title,
  count,
  total,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
  title: string;
  count: number;
  total: number;
  icon?: React.ReactNode;
}) {
  return (
    <Hint content={title}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={title}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary/40 aria-pressed:bg-primary/10 aria-pressed:text-foreground"
      >
        {icon}
        {label}
        <span className="font-mono tabular-nums text-faint">
          {count}/{total}
        </span>
      </button>
    </Hint>
  );
}

export function AchievementCard({
  row,
  isOwner = true,
  showProgress,
  formatNumber,
}: {
  row: AchievementRow;
  isOwner?: boolean;
  showProgress: boolean;
  formatNumber: (value: number) => string;
}) {
  const { t } = useTranslation();
  const Icon = achievementIcon(row.id);
  const goal = displayMetric(row.goal, row.unit);
  const current = displayMetric(row.value, row.unit);
  const withProgress =
    showProgress && !row.unlocked && !row.granted && row.goal > 0;
  const description = t(achievementDescriptionKey(row.id, isOwner), {
    goal: formatNumber(goal),
  });

  return (
    <div
      className={`flex min-w-0 gap-2.5 rounded-lg border p-2.5 transition-colors ${
        row.unlocked
          ? "border-border bg-card"
          : "border-transparent bg-surface-1"
      }`}
    >
      <div
        className={`relative flex size-10 shrink-0 items-center justify-center rounded-lg border ${
          row.unlocked
            ? RARITY_TILE[row.rarity]
            : "border-border bg-surface-2 text-faint"
        }`}
      >
        <Icon className="size-5" />
        {!row.unlocked && (
          <Lock className="absolute -right-1 -top-1 size-3.5 rounded-full bg-background p-0.5 text-faint" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <Hint
            content={t(`achievements.items.${row.id}.name`)}
            variant="text"
            truncatedOnly
          >
            <p
              className={`min-w-0 flex-1 truncate text-sm font-medium ${
                row.unlocked ? "" : "text-muted-foreground"
              }`}
            >
              {t(`achievements.items.${row.id}.name`)}
            </p>
          </Hint>
          <RarityMark row={row} />
          <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
            +{row.points}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Hint content={description} variant="text" truncatedOnly>
            <p className="min-w-0 flex-1 truncate text-xs text-faint">
              {description}
            </p>
          </Hint>
        </div>

        {withProgress && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-muted-foreground"
                style={{ width: `${Math.round(row.ratio * 100)}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-faint">
              {formatNumber(current)}/{formatNumber(goal)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function RarityMark({ row }: { row: AchievementRow }) {
  const { t, i18n } = useTranslation();

  const rarity = t(`achievements.rarity.${row.rarity}`);
  const hasPercent = row.percent !== null && row.percent > 0;
  const parts = hasPercent ? reachPercentParts(row.percent as number) : null;
  const reach = parts
    ? `${parts.belowFloor ? "<" : ""}${new Intl.NumberFormat(
        i18n.resolvedLanguage || i18n.language,
      ).format(parts.value)}`
    : "";

  return (
    <Hint
      content={
        parts
          ? `${rarity} · ${t("achievements.unlockedShare", { percent: reach })}`
          : rarity
      }
    >
      <span
        className={`flex size-4 shrink-0 items-center justify-center ${RARITY_TEXT[row.rarity]}`}
        aria-label={rarity}
      >
        <Trophy className="size-3" />
      </span>
    </Hint>
  );
}
