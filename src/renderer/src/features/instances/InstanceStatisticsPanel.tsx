import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowUp,
  CalendarDays,
  Clock,
  Flame,
  Footprints,
  Gem,
  Globe2,
  History,
  Rocket,
  Server,
  ShieldCheck,
  Skull,
  Swords,
  TrendingUp,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { IVersionSession, IVersionStatistics } from "@/types/VersionStatistics";
import { IWorldStatsAggregate } from "@/types/World";
import { Version } from "@renderer/classes/Version";
import { accountAtom } from "@renderer/stores/atoms";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { FactRow, FactRows } from "@renderer/components/FactRows";
import { formatDay } from "@renderer/utilities/date";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { formatNumber } from "@renderer/utilities/numbers";
import { readInstanceStatistics } from "./stats";
import { Fact, Panel } from "./statisticsParts";
import { InstanceResourcesView } from "./InstanceResourcesView";
import { dailyPlaytime, recentSessions } from "./instanceOverview";
import { useInstanceDataRevision } from "./instanceRevision";
import { useInstanceContents } from "./useInstanceInsights";
import {
  currentStreakDays,
  hourHistogram,
  launchCleanRate,
  playtimeByAccount,
  playtimeByServer,
  type Bucket,
} from "./statistics";
import { formatDuration } from "@renderer/utilities/duration";

const api = window.api;

function JournalRow({ label, value }: { label: string; value: string }) {
  return (
    <FactRow
      label={label}
      value={
        <Hint content={value} variant="text" truncatedOnly>
          <span className="min-w-0 truncate tabular-nums">
            {value}
          </span>
        </Hint>
      }
    />
  );
}

function BucketList({
  buckets,
  total,
  format,
  emptyLabel,
}: {
  buckets: Bucket[];
  total: number;
  format: (seconds: number) => string;
  emptyLabel: string;
}) {
  if (!buckets.length) {
    return (
      <Empty className="gap-1 p-3">
        <EmptyDescription className="text-xs text-faint">
          {emptyLabel}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {buckets.slice(0, 5).map((bucket) => (
        <div key={bucket.key} className="flex min-w-0 items-center gap-2.5">
          <Hint content={bucket.label} variant="text" truncatedOnly>
            <span className="min-w-0 flex-1 truncate text-xs">
              {bucket.label}
            </span>
          </Hint>
          <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-surface-3">
            <span
              className="block h-full rounded-full bg-chart-2/80"
              style={{
                width: `${total > 0 ? Math.max(4, (bucket.seconds / total) * 100) : 0}%`,
              }}
            />
          </span>
          <span className="shrink-0 text-right font-mono text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
            {format(bucket.seconds)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function InstanceStatisticsPanel({ instance }: { instance: Version }) {
  const account = useAtomValue(accountAtom);
  const [statistics, setStatistics] = useState<IVersionStatistics | null>(null);
  const [sessions, setSessions] = useState<IVersionSession[]>([]);
  const [worldStats, setWorldStats] = useState<IWorldStatsAggregate | null>(
    null,
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isSessionsLoaded, setIsSessionsLoaded] = useState(false);
  const [view, setView] = useState<"game" | "resources">("game");
  const revision = useInstanceDataRevision();
  const contents = useInstanceContents(instance.versionPath);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const data = await readInstanceStatistics(instance);
      if (cancelled) return;
      setStatistics(data.statistics);
      setLoadFailed(data.failed);
      setIsLoaded(true);

      try {
        const path = await api.path.join(instance.versionPath, "sessions.json");
        if (await api.fs.pathExists(path)) {
          const loaded = await api.fs.readJSON<IVersionSession[]>(
            path,
            "utf-8",
          );
          if (!cancelled && Array.isArray(loaded)) setSessions(loaded);
        }
      } catch {}

      if (cancelled) return;
      setIsSessionsLoaded(true);

      if (!account) return;

      try {
        const loaded = await api.worlds.loadVersionStatistics(
          instance.versionPath,
          account,
        );
        if (!cancelled) setWorldStats(loaded);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [instance, account, revision, attempt]);

  const format = (seconds: number) => formatDuration(seconds);

  const days = useMemo(() => dailyPlaytime(sessions, 30), [sessions]);
  const latest = useMemo(() => recentSessions(sessions, 12), [sessions]);

  if (!isLoaded) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid shrink-0 grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] grid-rows-[minmax(0,1fr)] gap-3">
          <Skeleton className="min-h-0 w-full rounded-xl" />
          <Skeleton className="min-h-0 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <Empty className="h-full border border-dashed border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {loadFailed ? <TriangleAlert /> : <Activity />}
          </EmptyMedia>
          <EmptyTitle>
            {t(
              loadFailed
                ? "versionStatistics.loadFailed"
                : "versionStatistics.empty",
            )}
          </EmptyTitle>
          {loadFailed && (
            <EmptyDescription>
              {t("versionStatistics.loadFailedHint")}
            </EmptyDescription>
          )}
        </EmptyHeader>
        {loadFailed && (
          <EmptyContent>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setAttempt((current) => current + 1)}
            >
              {t("common.retry")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  const launches = statistics.launches || 0;
  const playTime = statistics.playTime || 0;
  const crashes = statistics.crashes || 0;
  const average = launches > 0 ? Math.round(playTime / launches) : 0;
  const cleanRate = launchCleanRate(launches, crashes);
  const streak = currentStreakDays(sessions);
  const hours = hourHistogram(sessions);
  const hoursPeak = Math.max(...hours);
  const peakHour = hours.indexOf(hoursPeak);
  const daysPeak = Math.max(...days.map((day) => day.seconds), 1);

  const servers = playtimeByServer(
    sessions,
    t("versionStatistics.singleplayer"),
  );
  const accounts = playtimeByAccount(sessions);
  const sessionsTotal = sessions.reduce(
    (sum, session) => sum + Math.max(0, session.durationSec || 0),
    0,
  );

  const facts: { icon: LucideIcon; label: string; value: string }[] = [
    {
      icon: Clock,
      label: t("versionStatistics.playTime"),
      value: format(playTime),
    },
    {
      icon: Rocket,
      label: t("home.stats.launches"),
      value: formatNumber(launches),
    },
    {
      icon: Activity,
      label: t("versionStatistics.averageSession"),
      value: format(average),
    },
    {
      icon: TrendingUp,
      label: t("home.stats.longestSession"),
      value: format(statistics.longestSessionSec || 0),
    },
    {
      icon: ShieldCheck,
      label: t("versionStatistics.cleanRate"),
      value: cleanRate === null ? "—" : `${cleanRate}%`,
    },
    {
      icon: Flame,
      label: t("versionStatistics.streak"),
      value: t("versionStatistics.days", { count: streak }),
    },
  ];

  if (worldStats && worldStats.worlds > 0) {
    facts.push(
      {
        icon: Globe2,
        label: t("versionStatistics.worlds"),
        value: !contents.ready
          ? "…"
          : contents.savesUnknown
            ? "?"
            : formatNumber(contents.worlds),
      },
      {
        icon: Skull,
        label: t("versionStatistics.deaths"),
        value: formatNumber(worldStats.deaths),
      },
      {
        icon: Swords,
        label: t("versionStatistics.mobKills"),
        value: formatNumber(worldStats.mobKills),
      },
      {
        icon: Gem,
        label: t("versionStatistics.blocksMined"),
        value: formatNumber(worldStats.blocksMined),
      },
      {
        icon: Footprints,
        label: t("versionStatistics.distance"),
        value: `${formatNumber(Math.round(worldStats.distanceCm / 100000))} ${t("versionStatistics.km")}`,
      },
      {
        icon: ArrowUp,
        label: t("versionStatistics.jumps"),
        value: formatNumber(worldStats.jumps),
      },
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <SegmentedControl
          value={view}
          onChange={setView}
          ariaLabel={t("versionStatistics.resources.viewLabel")}
          options={[
            { value: "game", label: t("versionStatistics.resources.viewGame") },
            { value: "resources", label: t("versionStatistics.resources.viewResources") },
          ]}
        />
      </div>

      {view === "resources" ? (
        <InstanceResourcesView sessions={sessions} />
      ) : (
      <>
      <div className="grid shrink-0 grid-cols-6 gap-2">
        {facts.map((fact) => (
          <Fact
            key={fact.label}
            icon={fact.icon}
            label={fact.label}
            value={fact.value}
          />
        ))}
      </div>

      {sessionsTotal === 0 ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] grid-rows-[minmax(0,1fr)] gap-3">
          <Panel
            title={t("versionStatistics.journal")}
            icon={History}
            bodyClassName="flex flex-col"
          >
            <FactRows surface="card">
              <JournalRow
                label={t("versionStatistics.firstLaunch")}
                value={
                  statistics.firstLaunched
                    ? formatDay(new Date(statistics.firstLaunched))
                    : "—"
                }
              />
              <JournalRow
                label={t("versionStatistics.lastLaunch")}
                value={
                  statistics.lastLaunched
                    ? formatDay(new Date(statistics.lastLaunched))
                    : "—"
                }
              />
              <JournalRow
                label={t("home.stats.launches")}
                value={formatNumber(launches)}
              />
              <JournalRow
                label={t("versionStatistics.playTime")}
                value={format(playTime)}
              />
              <JournalRow
                label={t("versionStatistics.crashes")}
                value={formatNumber(crashes)}
              />
            </FactRows>

            {isSessionsLoaded ? (
              <Empty className="min-h-0 gap-1.5 p-4">
                <EmptyHeader className="gap-1">
                  <EmptyMedia variant="icon" className="mb-1">
                    <CalendarDays />
                  </EmptyMedia>
                  <EmptyTitle className="text-xs">
                    {t("versionStatistics.noSessions")}
                  </EmptyTitle>
                  <EmptyDescription className="max-w-xs text-2xs leading-snug text-faint">
                    {t("versionStatistics.noSessionsHint")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Skeleton className="m-3 min-h-0 flex-1 rounded-lg" />
            )}
          </Panel>

          <Panel
            title={t("versionStatistics.about.title")}
            icon={ShieldCheck}
            bodyClassName="flex flex-col gap-2 p-3"
          >
            {[
              { icon: Clock, text: t("versionStatistics.about.time") },
              { icon: Activity, text: t("versionStatistics.about.crashes") },
              { icon: Server, text: t("versionStatistics.about.servers") },
              { icon: Users, text: t("versionStatistics.about.accounts") },
            ].map((row) => (
              <div key={row.text} className="flex items-start gap-2.5">
                <row.icon className="mt-0.5 size-3.5 shrink-0 text-faint" />
                <span className="min-w-0 text-xs leading-snug text-muted-foreground">
                  {row.text}
                </span>
              </div>
            ))}

            <p className="mt-auto text-2xs leading-snug text-faint">
              {t("versionStatistics.about.local")}
            </p>
          </Panel>
        </div>
      ) : (
        <>
          <div className="grid min-h-[150px] flex-1 grid-cols-[minmax(0,1fr)_340px] grid-rows-[minmax(0,1fr)] gap-3">
            <Panel
              title={t("versionStatistics.dailyPlaytime")}
              icon={CalendarDays}
              hint={t("versionStatistics.lastDays", { days: days.length })}
            >
              <div className="flex h-full items-end gap-[3px] px-3 pt-3 pb-2">
                {days.map((day) => (
                  <Hint
                    key={day.day}
                    content={`${formatDay(new Date(`${day.day}T00:00:00`))} — ${format(day.seconds)}`}
                  >
                    <span
                      className={cn(
                        "min-h-[3px] min-w-0 flex-1 rounded-sm",
                        day.seconds > 0 ? "bg-chart-2/75" : "bg-surface-3",
                      )}
                      style={{
                        height: `${Math.max(3, (day.seconds / daysPeak) * 100)}%`,
                      }}
                    />
                  </Hint>
                ))}
              </div>
            </Panel>

            <Panel
              title={t("versionStatistics.byHour")}
              icon={Clock}
              hint={
                hoursPeak > 0
                  ? t("versionStatistics.peakHour", { hour: peakHour })
                  : undefined
              }
            >
              <div className="flex h-full items-end gap-[2px] px-3 pt-3 pb-2">
                {hours.map((value, hour) => (
                  <Hint key={hour} content={`${hour}:00 — ${format(value)}`}>
                    <span
                      className={cn(
                        "min-h-[3px] min-w-0 flex-1 rounded-sm",
                        value > 0 ? "bg-chart-2/75" : "bg-surface-3",
                      )}
                      style={{
                        height: `${Math.max(3, hoursPeak > 0 ? (value / hoursPeak) * 100 : 0)}%`,
                      }}
                    />
                  </Hint>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid shrink-0 grid-cols-4 items-start gap-3">
            <Panel
              title={t("versionStatistics.journal")}
              icon={History}
              className="max-h-[240px]"
              bodyClassName="overflow-y-auto"
            >
              <FactRows surface="card">
                <JournalRow
                  label={t("versionStatistics.firstLaunch")}
                  value={
                    statistics.firstLaunched
                      ? formatDay(new Date(statistics.firstLaunched))
                      : "—"
                  }
                />
                <JournalRow
                  label={t("versionStatistics.lastLaunch")}
                  value={
                    statistics.lastLaunched
                      ? formatDay(new Date(statistics.lastLaunched))
                      : "—"
                  }
                />
                <JournalRow
                  label={t("home.stats.launches")}
                  value={formatNumber(launches)}
                />
                <JournalRow
                  label={t("versionStatistics.crashes")}
                  value={formatNumber(crashes)}
                />
                <JournalRow
                  label={t("home.stats.longestSession")}
                  value={format(statistics.longestSessionSec || 0)}
                />
              </FactRows>
            </Panel>

            <Panel
              title={t("versionStatistics.byServer")}
              icon={Server}
              hint={format(sessionsTotal)}
              className="max-h-[240px]"
            >
              <BucketList
                buckets={servers}
                total={sessionsTotal}
                format={format}
                emptyLabel={t("versionStatistics.noSessions")}
              />
            </Panel>

            <Panel
              title={t("versionStatistics.byAccount")}
              icon={Users}
              hint={format(sessionsTotal)}
              className="max-h-[240px]"
            >
              <BucketList
                buckets={accounts}
                total={sessionsTotal}
                format={format}
                emptyLabel={t("versionStatistics.noSessions")}
              />
            </Panel>

            <Panel
              title={t("versionStatistics.recentSessions")}
              icon={Activity}
              className="max-h-[240px]"
              bodyClassName="overflow-y-auto py-1"
            >
              {latest.map((session) => (
                <Hint
                  key={session.id}
                  variant="text"
                  content={`${
                    session.server?.trim() ||
                    t("versionStatistics.singleplayer")
                  } · ${formatDay(new Date(session.startedAt))}`}
                >
                  <div className="flex items-center gap-2 px-3 py-1 text-2xs">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        session.crashed ? "bg-destructive" : "bg-success",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {session.server?.trim() ||
                        t("versionStatistics.singleplayer")}
                    </span>
                    <span className="min-w-16 shrink-0 text-right font-mono whitespace-nowrap tabular-nums">
                      {format(session.durationSec || 0)}
                    </span>
                  </div>
                </Hint>
              ))}
            </Panel>
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
