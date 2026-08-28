import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  ChevronRight,
  Gamepad2,
  Layers,
  Loader2,
  Sparkles,
  Target,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hint } from "@renderer/components/Hint";
import { IAchievementStats } from "@/types/Achievements";
import { versionsAtom } from "@renderer/stores/atoms";
import { instanceStatsAtom } from "@renderer/features/instances/instanceStats";
import { instanceKey } from "@renderer/features/instances/selectors";
import { formatTime } from "@renderer/utilities/date";
import {
  CATEGORY_ICON,
  CATEGORY_ORDER,
} from "@renderer/utilities/achievements";
import {
  AchievementRow,
  achievementDescriptionKey,
  displayMetric,
  pickAlmostThere,
  pickShowcase,
  remainingToGoal,
  tallyByCategory,
} from "./achievementRows";
import {
  RARITY_TEXT,
  RARITY_TILE,
  achievementIcon,
} from "./achievementVisuals";
import {
  buildWorldMetrics,
  favouriteInstance,
  hasWorldData,
  reachPercentParts,
} from "./profileMetrics";

const SHOWCASE_SLOTS = 6;
const GUEST_SHOWCASE_SLOTS = 12;
const CHASE_SLOTS = 6;

function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: typeof Trophy;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-3 ${className ?? ""}`}
    >
      <header className="flex h-5 shrink-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-faint" />
        <h3 className="min-w-0 truncate text-sm font-medium">{title}</h3>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function MoreLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-0.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
      <ChevronRight className="size-3.5" />
    </button>
  );
}

export function ProfileOverview({
  rows,
  isOwner,
  worldStats,
  isWorldLoading,
  worldStatsFailed,
  worldStatsPartial,
  onRetryWorldStats,
  onOpenAchievements,
}: {
  rows: AchievementRow[];
  isOwner: boolean;
  worldStats: IAchievementStats | undefined;
  isWorldLoading: boolean;
  worldStatsFailed?: boolean;
  worldStatsPartial?: boolean;
  onRetryWorldStats?: () => void;
  onOpenAchievements: () => void;
}) {
  const { t, i18n } = useTranslation();
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);

  const showcase = useMemo(
    () => pickShowcase(rows, isOwner ? SHOWCASE_SLOTS : GUEST_SHOWCASE_SLOTS),
    [rows, isOwner],
  );
  const almost = useMemo(
    () => (isOwner ? pickAlmostThere(rows, CHASE_SLOTS) : []),
    [rows, isOwner],
  );

  const slots = isOwner
    ? SHOWCASE_SLOTS
    : showcase.length > SHOWCASE_SLOTS
      ? GUEST_SHOWCASE_SLOTS
      : SHOWCASE_SLOTS;
  const showcaseTiles = (
    <>
      {showcase.slice(0, slots).map((row) => (
        <ShowcaseTile
          key={row.id}
          row={row}
          isOwner={isOwner}
          formatNumber={formatNumber}
        />
      ))}
      {Array.from({ length: Math.max(0, slots - showcase.length) }).map(
        (_, index) => (
          <EmptySlot key={`slot-${index}`} />
        ),
      )}
    </>
  );

  if (!isOwner) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Panel title={t("profile.showcase")} icon={Trophy} className="shrink-0">
          <div className="grid grid-cols-6 gap-2">{showcaseTiles}</div>
        </Panel>

        <CollectionPanel rows={rows} formatNumber={formatNumber} />
        <CategoryPanel rows={rows} className="min-h-0 flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Panel
        title={t("profile.showcase")}
        icon={Trophy}
        action={
          <MoreLink
            label={t("achievements.showAll")}
            onClick={onOpenAchievements}
          />
        }
        className="shrink-0"
      >
        <div className="grid grid-cols-6 gap-2">{showcaseTiles}</div>
      </Panel>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <ChasePanel
          rows={almost}
          isLoading={isWorldLoading}
          hasFailed={worldStatsFailed}
          formatNumber={formatNumber}
          onOpenAchievements={onOpenAchievements}
        />

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
          <WorldStatsPanel
            stats={worldStats}
            isLoading={isWorldLoading}
            hasFailed={worldStatsFailed}
            isPartial={worldStatsPartial}
            onRetry={onRetryWorldStats}
            formatNumber={formatNumber}
          />
          <CategoryPanel rows={rows} />
        </div>
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border p-2">
      <span className="flex size-11 items-center justify-center rounded-lg text-faint">
        <Trophy className="size-5 opacity-40" />
      </span>
      <span className="h-3.5" />
      <span className="h-3" />
    </div>
  );
}

function ShowcaseTile({
  row,
  isOwner,
  formatNumber,
}: {
  row: AchievementRow;
  isOwner: boolean;
  formatNumber: (value: number) => string;
}) {
  const { t } = useTranslation();
  const Icon = achievementIcon(row.id);
  const parts =
    row.percent === null || row.percent <= 0
      ? null
      : reachPercentParts(row.percent);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg bg-surface-1 p-2">
          <span
            className={`flex size-11 items-center justify-center rounded-lg border ${RARITY_TILE[row.rarity]}`}
          >
            <Icon className="size-5" />
          </span>
          <span className="w-full truncate text-center text-[11px] leading-tight text-muted-foreground">
            {t(`achievements.items.${row.id}.name`)}
          </span>
          <span
            className={`truncate font-mono text-[10px] tabular-nums ${RARITY_TEXT[row.rarity]}`}
          >
            {parts
              ? `${parts.belowFloor ? "<" : ""}${formatNumber(parts.value)}%`
              : `+${row.points}`}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p className="font-medium">{t(`achievements.items.${row.id}.name`)}</p>
        <p className="opacity-70">
          {t(achievementDescriptionKey(row.id, isOwner), {
            goal: formatNumber(displayMetric(row.goal, row.unit)),
          })}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function ChasePanel({
  rows,
  isLoading,
  hasFailed,
  formatNumber,
  onOpenAchievements,
}: {
  rows: AchievementRow[];
  isLoading: boolean;
  hasFailed?: boolean;
  formatNumber: (value: number) => string;
  onOpenAchievements: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Panel
      title={t("profile.almostThere")}
      icon={Target}
      action={
        <MoreLink
          label={t("achievements.showAll")}
          onClick={onOpenAchievements}
        />
      }
    >
      {isLoading ? (
        <PanelLoader />
      ) : hasFailed ? (
        <PanelEmpty text={t("profile.worldStatsFailed")} />
      ) : rows.length === 0 ? (
        <PanelEmpty text={t("profile.almostThereEmpty")} />
      ) : (
        <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
          {rows.map((row) => {
            const Icon = achievementIcon(row.id);

            return (
              <div
                key={row.id}
                className="flex h-14 min-w-0 shrink-0 items-center gap-2.5 rounded-lg bg-surface-1 px-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-medium">
                      {t(`achievements.items.${row.id}.name`)}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-faint">
                      {Math.round(row.ratio * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-muted-foreground"
                      style={{ width: `${Math.round(row.ratio * 100)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-faint">
                    {t("profile.remaining", {
                      value: formatNumber(remainingToGoal(row)),
                      unit: unitLabel(row, t),
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function WorldStatsPanel({
  stats,
  isLoading,
  hasFailed,
  isPartial,
  onRetry,
  formatNumber,
}: {
  stats: IAchievementStats | undefined;
  isLoading: boolean;
  hasFailed?: boolean;
  isPartial?: boolean;
  onRetry?: () => void;
  formatNumber: (value: number) => string;
}) {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const instanceStats = useAtomValue(instanceStatsAtom);

  const favourite = useMemo(
    () =>
      favouriteInstance(
        versions.map((version) => {
          const key = instanceKey(version);
          return {
            key,
            name: version.version.name,
            loader: version.version.loader?.name ?? "vanilla",
            playTime: instanceStats[key]?.playTime ?? 0,
            launches: instanceStats[key]?.launches ?? 0,
          };
        }),
      ),
    [versions, instanceStats],
  );

  const metrics = useMemo(
    () => (stats ? buildWorldMetrics(stats) : []),
    [stats],
  );

  return (
    <Panel
      title={t("profile.worldStats")}
      icon={Gamepad2}
      className="shrink-0"
      action={
        isPartial && !isLoading && !hasFailed ? (
          <Hint content={t("profile.worldStatsPartial")}>
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 rounded-md text-[11px] text-warning transition-colors hover:text-foreground"
            >
              <TriangleAlert className="size-3.5" />
              {t("profile.worldStatsPartialShort")}
            </button>
          </Hint>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex h-28 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : hasFailed ? (
        <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 text-center">
          <p className="text-xs text-muted-foreground">
            {t("profile.worldStatsFailed")}
          </p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t("common.retry")}
            </Button>
          )}
        </div>
      ) : !stats || !hasWorldData(stats) ? (
        <p className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
          {t("profile.worldStatsEmpty")}
        </p>
      ) : (
        <div className="grid gap-2">
          <div className="grid grid-cols-4 gap-1.5">
            {metrics.map((metric) => (
              <div
                key={metric.key}
                className="flex h-12 flex-col items-center justify-center rounded-lg bg-surface-1 px-1"
              >
                <span className="w-full truncate text-center font-mono text-sm tabular-nums">
                  {formatNumber(metric.value)}
                  {metric.unit === "km" ? ` ${t("achievements.unit.km")}` : ""}
                  {metric.unit === "hours" ? ` ${t("time.h")}` : ""}
                </span>
                <span className="w-full truncate text-center text-[10px] text-faint">
                  {t(`profile.metrics.${metric.key}`)}
                </span>
              </div>
            ))}
          </div>

          {favourite && (
            <div className="flex h-11 min-w-0 items-center gap-2 rounded-lg bg-surface-1 px-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted-foreground">
                <Sparkles className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] text-faint">
                  {t("profile.favouriteInstance")}
                </p>
                <Hint content={favourite.name} variant="text" truncatedOnly>
                  <p className="truncate text-xs font-medium">
                    {favourite.name}
                  </p>
                </Hint>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatTime(favourite.playTime, {
                  h: t("time.h"),
                  m: t("time.m"),
                  s: t("time.s"),
                })}
              </span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function CategoryPanel({
  rows,
  className,
}: {
  rows: AchievementRow[];
  className?: string;
}) {
  const { t } = useTranslation();
  const tally = useMemo(() => tallyByCategory(rows, CATEGORY_ORDER), [rows]);

  return (
    <Panel title={t("profile.categories")} icon={Layers} className={className}>
      <div
        className="grid min-h-0 flex-1 gap-0.5"
        style={{
          gridTemplateRows: `repeat(${CATEGORY_ORDER.length}, minmax(0, 1fr))`,
        }}
      >
        {tally.map((entry) => {
          const Icon = CATEGORY_ICON[entry.category];
          const ratio = entry.total > 0 ? entry.unlocked / entry.total : 0;

          return (
            <div
              key={entry.category}
              className="relative flex min-h-0 min-w-0 items-center gap-2 overflow-hidden rounded-md bg-surface-1 px-2"
            >
              <span
                className="absolute inset-y-0 left-0 bg-surface-3"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
              <Icon className="relative size-3 shrink-0 text-faint" />
              <span className="relative min-w-0 flex-1 truncate text-[11px]">
                {t(`achievements.categories.${entry.category}`)}
              </span>
              <span className="relative shrink-0 font-mono text-[10px] tabular-nums text-faint">
                {entry.unlocked}/{entry.total}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function CollectionPanel({
  rows,
  formatNumber,
}: {
  rows: AchievementRow[];
  formatNumber: (value: number) => string;
}) {
  const { t } = useTranslation();

  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const row of rows) {
      if (!row.unlocked) continue;
      tally.set(row.rarity, (tally.get(row.rarity) ?? 0) + 1);
    }
    return tally;
  }, [rows]);

  return (
    <Panel title={t("profile.collection")} icon={Trophy} className="shrink-0">
      <div className="grid grid-cols-4 gap-1.5">
        {(["legendary", "epic", "rare", "common"] as const).map((rarity) => (
          <div
            key={rarity}
            className="flex h-14 flex-col items-center justify-center rounded-lg bg-surface-1 px-1"
          >
            <span
              className={`font-mono text-base tabular-nums ${RARITY_TEXT[rarity]}`}
            >
              {formatNumber(counts.get(rarity) ?? 0)}
            </span>
            <span className="w-full truncate text-center text-[10px] text-faint">
              {t(`achievements.rarity.${rarity}`)}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PanelLoader() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return (
    <p className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function unitLabel(row: AchievementRow, t: (key: string) => string): string {
  if (row.unit === "km") return t("achievements.unit.km");
  if (row.unit === "ticksHours" || row.unit === "secondsHours") {
    return t("time.h");
  }
  return "";
}
