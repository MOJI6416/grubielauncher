import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutGrid,
  Lock,
  RefreshCw,
  Search,
  SearchX,
  Trophy,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { SortMenu } from "@renderer/components/SortMenu";
import { formatNumber } from "@renderer/utilities/numbers";
import { IUser } from "@/types/IUser";
import {
  EMPTY_ACHIEVEMENT_STATS,
  IAchievementStats,
} from "@/types/Achievements";
import {
  AchievementDifficulty,
  CATEGORY_ICON,
  CATEGORY_ORDER,
  DIFFICULTY_ORDER,
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
  DIFFICULTY_TEXT,
  DIFFICULTY_TILE,
  achievementIcon,
} from "./achievementVisuals";
import { reachPercentParts } from "./profileMetrics";
import { ensureFreshAccount } from "./loadProfileUser";

const api = window.api;

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

  const nameOf = (id: string) => t(`achievements.items.${id}.name`);

  const summary = useMemo(() => summarizeAchievements(rows), [rows]);
  const tally = useMemo(() => tallyByCategory(rows, CATEGORY_ORDER), [rows]);

  const difficultyCounts = useMemo(() => {
    const counts = new Map<
      AchievementDifficulty,
      { unlocked: number; total: number }
    >();
    for (const row of rows) {
      const entry = counts.get(row.difficulty) ?? { unlocked: 0, total: 0 };
      entry.total += 1;
      if (row.unlocked) entry.unlocked += 1;
      counts.set(row.difficulty, entry);
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

  const activeTally = tally.find((entry) => entry.category === category);
  const activeCategoryLabel = t("achievements.unlockedOf", {
    unlocked: formatNumber(
      activeTally ? activeTally.unlocked : summary.unlocked,
    ),
    total: formatNumber(activeTally ? activeTally.total : summary.total),
  });

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
          <Hint
            content={t("achievements.unlockedOf", {
              unlocked: formatNumber(summary.unlocked),
              total: formatNumber(summary.total),
            })}
            variant="text"
            truncatedOnly
          >
            <p className="truncate text-sm font-medium">
              {t("achievements.unlockedOf", {
                unlocked: formatNumber(summary.unlocked),
                total: formatNumber(summary.total),
              })}
            </p>
          </Hint>
          <Hint
            content={t("achievements.pointsOf", {
              points: formatNumber(summary.points),
              total: formatNumber(summary.totalPoints),
            })}
            variant="text"
            truncatedOnly
          >
            <p className="truncate text-xs text-muted-foreground">
              {t("achievements.pointsOf", {
                points: formatNumber(summary.points),
                total: formatNumber(summary.totalPoints),
              })}
            </p>
          </Hint>
        </div>

        <div
          role="group"
          aria-label={t("achievements.difficulty.label")}
          className="flex shrink-0 items-center gap-1.5"
        >
          {DIFFICULTY_ORDER.map((difficulty) => {
            const entry = difficultyCounts.get(difficulty) ?? {
              unlocked: 0,
              total: 0,
            };

            return (
              <Hint
                key={difficulty}
                content={t("achievements.difficultyUnlocked", {
                  difficulty: t(`achievements.difficulty.${difficulty}`),
                })}
              >
                <div className="flex h-11 min-w-16 flex-col items-center justify-center rounded-lg bg-surface-1 px-2">
                  <span
                    className={`font-mono text-sm tabular-nums ${DIFFICULTY_TEXT[difficulty]}`}
                  >
                    {formatNumber(entry.unlocked)}
                    <span className="text-faint">
                      /{formatNumber(entry.total)}
                    </span>
                  </span>
                  <span className="text-3xs text-faint">
                    {t(`achievements.difficulty.${difficulty}`)}
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

          <SegmentedControl
            value={status}
            ariaLabel={t("achievements.statusFilter")}
            options={(["all", "unlocked", "locked"] as AchievementStatus[]).map(
              (value) => ({
                value,
                label: t(`achievements.filter.${value}`),
              }),
            )}
            onChange={setStatus}
          />

          <SortMenu
            value={sort}
            options={ACHIEVEMENT_SORTS.map((value) => ({
              value,
              label: t(`achievements.sort.${value}`),
            }))}
            onChange={setSort}
          />
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          <SegmentedControl
            value={category}
            iconOnly="inactive"
            ariaLabel={t("achievements.categoryFilter")}
            options={[
              {
                value: "all" as const,
                label: t("achievements.filter.all"),
                icon: <LayoutGrid />,
                hint: `${t("achievements.filter.all")} · ${summary.unlocked}/${summary.total}`,
              },
              ...tally.map((entry) => {
                const Icon = CATEGORY_ICON[entry.category];
                const label = t(`achievements.categories.${entry.category}`);
                return {
                  value: entry.category,
                  label,
                  icon: <Icon />,
                  hint: `${label} · ${entry.unlocked}/${entry.total}`,
                };
              }),
            ]}
            onChange={setCategory}
          />
          <Hint content={activeCategoryLabel} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {activeCategoryLabel}
            </span>
          </Hint>
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
          <div aria-busy className="grid grid-cols-2 gap-2">
            <span className="sr-only">{t("achievements.loading")}</span>
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="flex h-16 min-w-0 items-center gap-2.5 rounded-lg bg-surface-1 p-2.5"
              >
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-2/5 rounded" />
                  <Skeleton className="h-2.5 w-3/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Empty className="h-40 flex-none rounded-xl border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {isFiltered ? <SearchX /> : <Trophy />}
              </EmptyMedia>
              <EmptyTitle>{t("achievements.empty")}</EmptyTitle>
            </EmptyHeader>
            {isFiltered && (
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  {t("achievements.resetFilters")}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((row) => (
              <AchievementCard
                key={row.id}
                row={row}
                isOwner={isOwner}
                showProgress={isOwner}
                formatNumber={formatNumber}
                totalPlayers={totalPlayers}
              />
            ))}
          </div>
        )}
      </div>

      {isFiltered && !isLoading && (
        <div className="flex h-9 shrink-0 items-center gap-3 rounded-lg bg-surface-1 px-3">
          <Hint
            content={t("achievements.filtered", {
              shown: formatNumber(visible.length),
              total: formatNumber(rows.length),
            })}
            variant="text"
            truncatedOnly
          >
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {t("achievements.filtered", {
                shown: formatNumber(visible.length),
                total: formatNumber(rows.length),
              })}
            </span>
          </Hint>
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
          className="stroke-info transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-2xs font-semibold tabular-nums">
        {value}%
      </span>
    </div>
  );
}

export function AchievementCard({
  row,
  isOwner = true,
  showProgress,
  formatNumber,
  totalPlayers = null,
}: {
  row: AchievementRow;
  isOwner?: boolean;
  showProgress: boolean;
  formatNumber: (value: number) => string;
  totalPlayers?: number | null;
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
            ? DIFFICULTY_TILE[row.difficulty]
            : "border-border bg-surface-2 text-faint"
        }`}
      >
        <Icon className="size-5" />
        {!row.unlocked && (
          <Lock className="absolute -right-1 -top-1 size-3.5 rounded-full bg-surface-3 p-0.5 text-faint" />
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
          <ReachMark row={row} totalPlayers={totalPlayers} />
          <DifficultyMark row={row} />
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
            <span className="shrink-0 font-mono text-3xs tabular-nums text-faint">
              {formatNumber(current)}/{formatNumber(goal)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ReachMark({
  row,
  totalPlayers,
}: {
  row: AchievementRow;
  totalPlayers: number | null;
}) {
  const { t } = useTranslation();

  if (row.percent === null) return null;

  const parts = reachPercentParts(row.percent);
  const number = `${parts.belowFloor ? "<" : ""}${formatNumber(parts.value)}`;
  const value = t("achievements.percentValue", { value: number });
  const share = t("achievements.unlockedShare", { percent: number });

  return (
    <Hint
      content={
        totalPlayers
          ? `${share} · ${t("achievements.reachHint", {
              players: formatNumber(totalPlayers),
            })}`
          : share
      }
    >
      <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-foreground">
        {value}
      </span>
    </Hint>
  );
}

function DifficultyMark({ row }: { row: AchievementRow }) {
  const { t } = useTranslation();

  const label = t("achievements.difficultyOf", {
    difficulty: t(`achievements.difficulty.${row.difficulty}`),
  });

  return (
    <Hint
      content={`${label} · ${t("achievements.pointsValue", { points: row.points })}`}
    >
      <span
        aria-label={label}
        className={`flex shrink-0 items-center gap-0.5 font-mono text-xs tabular-nums ${DIFFICULTY_TEXT[row.difficulty]}`}
      >
        <Trophy className="size-3" />
        {row.points}
      </span>
    </Hint>
  );
}
