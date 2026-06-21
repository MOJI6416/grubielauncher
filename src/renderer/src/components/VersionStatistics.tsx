import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  IVersionSession,
  IVersionStatistics,
} from "@/types/VersionStatistics";
import { IWorldStatsAggregate } from "@/types/World";
import { useTranslation } from "react-i18next";
import { formatDate, formatDay, formatTime } from "@renderer/utilities/date";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { CircleAlert, Clock3 } from "lucide-react";
import type { ReactNode } from "react";

export function VersionStatistics({
  onClose,
  statistics,
  sessions = [],
  worldStats = null,
}: {
  onClose: () => void;
  statistics: IVersionStatistics;
  sessions?: IVersionSession[];
  worldStats?: IWorldStatsAggregate | null;
}) {
  const { t, i18n } = useTranslation();
  const timeLabels = { h: t("time.h"), m: t("time.m"), s: t("time.s") };
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);
  const hasWorldStats = !!worldStats && worldStats.worlds > 0;

  const launches = statistics?.launches || 0;
  const avgSession =
    launches > 0 ? Math.round((statistics.playTime || 0) / launches) : 0;
  const longestSession =
    statistics?.longestSessionSec ??
    sessions.reduce((max, s) => Math.max(max, s.durationSec || 0), 0);
  const crashes =
    statistics?.crashes ?? sessions.filter((s) => s.crashed).length;

  const recentSessions = [...sessions].slice(-8).reverse();
  const maxDuration = recentSessions.reduce(
    (max, s) => Math.max(max, s.durationSec || 0),
    0,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="overflow-hidden sm:max-w-[520px]"
      >
        <DialogHeader>
          <DialogTitle>{t("versionStatistics.title")}</DialogTitle>
        </DialogHeader>

        <div className="-mr-1 min-w-0 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          {!statistics && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("versionStatistics.error")}</AlertTitle>
            </Alert>
          )}
          {statistics && (
            <div className="grid gap-3">
              <Card className="overflow-hidden border-border/80 bg-card/80 py-0">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock3 className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {t("versionStatistics.playTime")}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-2xl font-semibold tracking-tight">
                      {formatTime(statistics.playTime, timeLabels)}
                    </p>
                  </div>
                  <div className="flex w-[210px] shrink-0 flex-col gap-1 text-sm">
                    <BandStat
                      label={t("versionStatistics.launches")}
                      value={formatNumber(launches)}
                    />
                    <BandStat
                      label={t("versionStatistics.lastLaunch")}
                      value={formatDay(new Date(statistics.lastLaunched))}
                      title={formatDate(new Date(statistics.lastLaunched))}
                    />
                    <BandStat
                      label={t("versionStatistics.firstLaunch")}
                      value={
                        statistics.firstLaunched
                          ? formatDay(new Date(statistics.firstLaunched))
                          : "—"
                      }
                      title={
                        statistics.firstLaunched
                          ? formatDate(new Date(statistics.firstLaunched))
                          : undefined
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-3 gap-2">
                <StatTile
                  label={t("versionStatistics.avgSession")}
                  value={formatTime(avgSession, timeLabels)}
                />
                <StatTile
                  label={t("versionStatistics.longestSession")}
                  value={formatTime(longestSession, timeLabels)}
                />
                <StatTile
                  label={t("versionStatistics.crashes")}
                  value={formatNumber(crashes)}
                />
              </div>

              {hasWorldStats && worldStats && (
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-medium text-muted-foreground">
                    {t("versionStatistics.inGame")}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <StatTile
                      label={t("versionStatistics.inGameTime")}
                      value={formatTime(
                        Math.floor(worldStats.playTimeTicks / 20),
                        timeLabels,
                      )}
                    />
                    <StatTile
                      label={t("versionStatistics.deaths")}
                      value={formatNumber(worldStats.deaths)}
                    />
                    <StatTile
                      label={t("versionStatistics.mobKills")}
                      value={formatNumber(worldStats.mobKills)}
                    />
                    <StatTile
                      label={t("versionStatistics.distance")}
                      value={`${formatNumber(
                        Math.round(worldStats.distanceCm / 1000) / 100,
                      )} ${t("versionStatistics.km")}`}
                    />
                    <StatTile
                      label={t("versionStatistics.blocksMined")}
                      value={formatNumber(worldStats.blocksMined)}
                    />
                    <StatTile
                      label={t("versionStatistics.jumps")}
                      value={formatNumber(worldStats.jumps)}
                    />
                  </div>
                </div>
              )}

              <div className="min-w-0">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  {t("versionStatistics.recentSessions")}
                </p>
                {recentSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("versionStatistics.noSessions")}
                  </p>
                ) : (
                  <div className="grid gap-1.5">
                    {recentSessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        max={maxDuration}
                        timeLabels={timeLabels}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SessionRow({
  session,
  max,
  timeLabels,
}: {
  session: IVersionSession;
  max: number;
  timeLabels: { h: string; m: string; s: string };
}) {
  const pct =
    max > 0 ? Math.max(4, Math.round((session.durationSec / max) * 100)) : 0;

  const endedAt = new Date(session.endedAt);
  const tooltip = [formatDate(endedAt), session.server]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-2.5" title={tooltip}>
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {formatDay(endedAt)}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
        <div
          className={`h-full rounded-full ${
            session.crashed ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs font-medium">
        {formatTime(session.durationSec, timeLabels)}
      </span>
    </div>
  );
}

function BandStat({
  label,
  value,
  title,
}: {
  label: string;
  value: ReactNode;
  title?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3" title={title}>
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium tabular-nums">{value}</span>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="min-h-[1.875rem] text-xs leading-tight text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}
