import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Clock,
  Download,
  GitBranch,
  Info,
  PlaySquare,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { IModpackAnalytics, IModpackAnalyticsBuild } from "@/types/Backend";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { formatDay } from "@renderer/utilities/date";
import { formatDuration } from "@renderer/utilities/duration";
import { formatNumber } from "@renderer/utilities/numbers";
import { Fact, Panel } from "@renderer/features/instances/statisticsParts";
import {
  ANALYTICS_DAYS,
  crashLevel,
  crashRate,
  crashTotals,
  dayValue,
  fillDays,
  isRateReliable,
  toPercent,
  type CrashLevel,
  type DayMetric,
} from "./packAnalytics";
import { usePackAnalytics } from "./usePackAuthor";

const LEVEL_BAR: Record<CrashLevel, string> = {
  ok: "bg-success/70",
  warn: "bg-warning/80",
  bad: "bg-destructive/80",
};

const LEVEL_TEXT: Record<CrashLevel, string> = {
  ok: "text-muted-foreground",
  warn: "text-warning",
  bad: "text-destructive",
};

function percentLabel(rate: number): string {
  return `${formatNumber(toPercent(rate))}%`;
}

function utcDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function BuildRow({
  build,
  isCurrent,
}: {
  build: IModpackAnalyticsBuild;
  isCurrent: boolean;
}) {
  const { t } = useTranslation();
  const rate = crashRate(build.crashes, build.sessions);
  const reliable = isRateReliable(build.sessions);
  const level = reliable ? crashLevel(rate) : "ok";
  const label = t("packAuthor.analytics.buildLabel", { build: build.build });

  const details = [
    t("packAuthor.analytics.sessionsCount", { count: build.sessions }),
    t("packAuthor.analytics.crashesCount", { count: build.crashes }),
    `${t("packAuthor.analytics.playTime")}: ${formatDuration(build.playSeconds)}`,
    t("packAuthor.analytics.installsCount", { count: build.installs }),
    t("packAuthor.analytics.activePlayersCount", {
      count: build.activePlayers,
    }),
    ...(build.since
      ? [t("packAuthor.analytics.buildSince", { date: formatDay(utcDay(build.since)) })]
      : []),
  ].join(" · ");

  return (
    <Hint content={details} variant="text">
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-1.5">
        <span className="flex min-w-0 shrink-0 items-center gap-1.5">
          <span className="text-xs font-medium whitespace-nowrap tabular-nums">
            {label}
          </span>
          {isCurrent && (
            <span className="flex h-4 items-center rounded bg-surface-3 px-1 text-4xs font-medium whitespace-nowrap text-muted-foreground uppercase">
              {t("packAuthor.analytics.current")}
            </span>
          )}
        </span>
        <span className="h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-surface-3">
          <span
            className={cn("block h-full rounded-full", LEVEL_BAR[level])}
            style={{
              width: `${rate != null && reliable ? Math.max(3, rate * 100) : 0}%`,
            }}
          />
        </span>
        <span
          className={cn(
            "shrink-0 text-right font-mono text-2xs whitespace-nowrap tabular-nums",
            reliable ? LEVEL_TEXT[level] : "text-faint",
          )}
        >
          {rate != null && reliable
            ? percentLabel(rate)
            : t("packAuthor.analytics.fewSessions")}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
          <Users className="size-3 text-faint" />
          {formatNumber(build.activePlayers)}
        </span>
      </div>
    </Hint>
  );
}

function AnalyticsBody({ analytics }: { analytics: IModpackAnalytics }) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<DayMetric>("players");
  const days = useMemo(() => fillDays(analytics.days), [analytics.days]);
  const peak = Math.max(1, ...days.map((day) => dayValue(day, metric)));
  const totals = crashTotals(analytics.builds);
  const overallRate = crashRate(totals.crashes, totals.sessions);
  const overallReliable = isRateReliable(totals.sessions);

  const format = (value: number) =>
    metric === "playSeconds" ? formatDuration(value) : formatNumber(value);

  const facts: {
    icon: LucideIcon;
    label: string;
    value: string;
    note?: string;
    hint?: string;
  }[] = [
    {
      icon: Download,
      label: t("packAuthor.analytics.installs"),
      value: formatNumber(analytics.installs),
      hint: t("packAuthor.analytics.installsHint", {
        count: analytics.installAccounts,
      }),
    },
    {
      icon: Users,
      label: t("packAuthor.analytics.players"),
      value: formatNumber(analytics.players),
      hint: t("packAuthor.analytics.playersHint"),
    },
    {
      icon: UserCheck,
      label: t("packAuthor.analytics.activeWeek"),
      value: formatNumber(analytics.active.week),
      hint: t("packAuthor.analytics.activeHint", {
        day: formatNumber(analytics.active.day),
        month: formatNumber(analytics.active.month),
      }),
    },
    {
      icon: Clock,
      label: t("packAuthor.analytics.playTime"),
      value: formatDuration(analytics.playSeconds),
    },
    {
      icon: PlaySquare,
      label: t("packAuthor.analytics.sessions"),
      value: formatNumber(analytics.sessions),
    },
    {
      icon: ShieldAlert,
      label: t("packAuthor.analytics.crashRate"),
      value:
        overallRate != null && overallReliable ? percentLabel(overallRate) : "—",
      hint: t("packAuthor.analytics.crashRateHint"),
    },
  ];

  return (
    <>
      <div className="grid shrink-0 grid-cols-6 gap-2">
        {facts.map((fact) => (
          <Fact
            key={fact.label}
            icon={fact.icon}
            label={fact.label}
            value={fact.value}
            hint={fact.hint}
          />
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] grid-rows-[minmax(0,1fr)] gap-3">
        <Panel
          title={t("packAuthor.analytics.byDay")}
          icon={CalendarDays}
          hint={t("versionStatistics.lastDays", { days: ANALYTICS_DAYS })}
          bodyClassName="flex flex-col"
        >
          <div className="flex shrink-0 justify-end px-3 pt-2">
            <SegmentedControl
              value={metric}
              onChange={setMetric}
              ariaLabel={t("packAuthor.analytics.metricLabel")}
              options={[
                { value: "players", label: t("packAuthor.analytics.players") },
                { value: "installs", label: t("packAuthor.analytics.installs") },
                { value: "playSeconds", label: t("packAuthor.analytics.hours") },
              ]}
            />
          </div>
          <div className="flex min-h-0 flex-1 items-end gap-[3px] px-3 pt-3 pb-2">
            {days.map((day) => {
              const value = dayValue(day, metric);
              return (
                <Hint
                  key={day.day}
                  content={`${formatDay(utcDay(day.day))} — ${format(value)}`}
                >
                  <span
                    className={cn(
                      "min-h-[3px] min-w-0 flex-1 rounded-sm",
                      value > 0 ? "bg-chart-2/75" : "bg-surface-3",
                    )}
                    style={{ height: `${Math.max(3, (value / peak) * 100)}%` }}
                  />
                </Hint>
              );
            })}
          </div>
        </Panel>

        <Panel
          title={t("packAuthor.analytics.byBuild")}
          icon={GitBranch}
          bodyClassName="flex flex-col overflow-y-auto py-1"
        >
          {analytics.builds.length === 0 ? (
            <Empty className="gap-1 p-3">
              <EmptyDescription className="text-xs text-faint">
                {t("packAuthor.analytics.noBuilds")}
              </EmptyDescription>
            </Empty>
          ) : (
            analytics.builds.map((build) => (
              <BuildRow
                key={build.build}
                build={build}
                isCurrent={build.build === analytics.build}
              />
            ))
          )}
        </Panel>
      </div>

      <p className="flex shrink-0 items-center gap-1.5 text-2xs leading-snug text-faint">
        <Info className="size-3 shrink-0" />
        {analytics.since
          ? t("packAuthor.analytics.since", {
              date: formatDay(utcDay(analytics.since)),
            })
          : t("packAuthor.analytics.noSessionsYet")}
      </p>
    </>
  );
}

export function PackAnalyticsView({ code }: { code: string }) {
  const { t } = useTranslation();
  const query = usePackAnalytics(code, true);

  if (query.isPending && query.fetchStatus !== "idle") {
    return (
      <>
        <div className="grid shrink-0 grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] grid-rows-[minmax(0,1fr)] gap-3">
          <Skeleton className="min-h-0 w-full rounded-xl" />
          <Skeleton className="min-h-0 w-full rounded-xl" />
        </div>
      </>
    );
  }

  if (query.data) return <AnalyticsBody analytics={query.data} />;

  const isOffline = query.fetchStatus === "idle" && query.isPending;
  const isFailed = query.isError || isOffline;

  return (
    <Empty className="min-h-0 flex-1 border border-dashed border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {isFailed ? <TriangleAlert /> : <Users />}
        </EmptyMedia>
        <EmptyTitle>
          {t(
            isFailed
              ? "packAuthor.analytics.failed"
              : "packAuthor.analytics.unavailable",
          )}
        </EmptyTitle>
        <EmptyDescription>
          {t(
            isFailed
              ? "packAuthor.analytics.failedHint"
              : "packAuthor.analytics.unavailableHint",
          )}
        </EmptyDescription>
      </EmptyHeader>
      {query.isError && (
        <EmptyContent>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void query.refetch()}
          >
            {t("common.retry")}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
