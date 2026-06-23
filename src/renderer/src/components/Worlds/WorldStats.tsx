import { IWorld } from "@/types/World";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { FolderOpen, Hash } from "lucide-react";
import { formatTime } from "@renderer/utilities/date";
import { worldDisplayStats } from "@renderer/utilities/worldStats";
import type { ReactNode } from "react";

export function WorldStats({
  world,
  onClose,
}: {
  world: IWorld;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const stats = useMemo(
    () => worldDisplayStats(world.statistics),
    [world.statistics],
  );
  const nf = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);
  const timeLabels = { h: t("time.h"), m: t("time.m"), s: t("time.s") };
  const km = Math.round(stats.distanceCm / 1000) / 100;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[88vh] flex-col gap-4 overflow-hidden sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 text-muted-foreground">
              {world.icon ? (
                <img
                  src={world.icon}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <FolderOpen className="size-4" />
              )}
            </span>
            <span className="truncate">{world.name}</span>
          </DialogTitle>
        </DialogHeader>

        {!stats.hasData ? (
          <div className="flex h-40 items-center justify-center rounded-xl border bg-muted/20 text-sm text-muted-foreground">
            {t("worldStats.noData")}
          </div>
        ) : (
          <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-2">
                <Tile
                  label={t("versionStatistics.inGameTime")}
                  value={formatTime(
                    Math.floor(stats.playTimeTicks / 20),
                    timeLabels,
                  )}
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
                <Tile
                  label={t("versionStatistics.jumps")}
                  value={nf(stats.jumps)}
                />
                <Tile
                  label={t("worldStats.timesSlept")}
                  value={nf(stats.timesSlept)}
                />
                <Tile
                  label={t("worldStats.damageDealt")}
                  value={nf(stats.damageDealt)}
                />
                <Tile
                  label={t("worldStats.damageTaken")}
                  value={nf(stats.damageTaken)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums">
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
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Hash className="size-3.5" />
        {title}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <div className="grid gap-1.5">
          {entries.map((entry) => (
            <div
              key={entry.name}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">{entry.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {format(entry.count)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
