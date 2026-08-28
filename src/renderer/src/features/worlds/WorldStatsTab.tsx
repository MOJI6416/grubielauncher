import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { IWorld } from "@/types/World";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { formatTime } from "@renderer/utilities/date";
import { worldDisplayStats } from "@renderer/utilities/worldStats";

export function WorldStatsTab({
  world,
  locale,
}: {
  world: IWorld;
  locale: string;
}) {
  const { t } = useTranslation();
  const stats = useMemo(
    () => worldDisplayStats(world.statistics),
    [world.statistics],
  );

  if (!stats.hasData) {
    return (
      <Empty className="h-full border border-dashed border-border bg-surface-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart3 />
          </EmptyMedia>
          <EmptyTitle>{t("worldStats.noData")}</EmptyTitle>
          <EmptyDescription>{t("worldStats.noDataHint")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const nf = (value: number) => new Intl.NumberFormat(locale).format(value);
  const km = Math.round(stats.distanceCm / 1000) / 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
        <Tile
          label={t("versionStatistics.inGameTime")}
          value={formatTime(Math.floor(stats.playTimeTicks / 20), {
            h: t("time.h"),
            m: t("time.m"),
            s: t("time.s"),
          })}
        />
        <Tile label={t("versionStatistics.deaths")} value={nf(stats.deaths)} />
        <Tile
          label={t("versionStatistics.mobKills")}
          value={nf(stats.mobKills)}
        />
        <Tile
          label={t("worldStats.playerKills")}
          value={nf(stats.playerKills)}
        />
        <Tile
          label={t("versionStatistics.distance")}
          value={`${nf(km)} ${t("versionStatistics.km")}`}
        />
        <Tile
          label={t("versionStatistics.blocksMined")}
          value={nf(stats.blocksMined)}
        />
        <Tile
          label={t("worldStats.itemsCrafted")}
          value={nf(stats.itemsCrafted)}
        />
        <Tile label={t("versionStatistics.jumps")} value={nf(stats.jumps)} />
        <Tile label={t("worldStats.timesSlept")} value={nf(stats.timesSlept)} />
        <Tile
          label={t("worldStats.damageDealt")}
          value={nf(stats.damageDealt)}
        />
        <Tile
          label={t("worldStats.damageTaken")}
          value={nf(stats.damageTaken)}
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <TopList
          title={t("worldStats.topMined")}
          entries={stats.topMined}
          format={nf}
        />
        <TopList
          title={t("worldStats.topKilled")}
          entries={stats.topKilled}
          format={nf}
        />
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-surface-1 px-2.5 py-2">
      <Hint content={label} variant="text" truncatedOnly>
        <div className="truncate text-[0.65rem] text-faint">{label}</div>
      </Hint>
      <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function TopList({
  title,
  entries,
  format,
}: {
  title: string;
  entries: { name: string; count: number }[];
  format: (value: number) => string;
}) {
  const max = entries[0]?.count ?? 0;

  return (
    <div className="min-w-0 rounded-xl border bg-surface-1">
      <div className="border-b px-3 py-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.name} className="flex min-w-0 items-center gap-2">
              <Hint content={entry.name} variant="text" truncatedOnly>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {entry.name}
                </span>
              </Hint>
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
                <span
                  className="block h-full rounded-full bg-primary/70"
                  style={{
                    width: `${max > 0 ? Math.max(6, (entry.count / max) * 100) : 0}%`,
                  }}
                />
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-[0.65rem] text-muted-foreground tabular-nums">
                {format(entry.count)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
