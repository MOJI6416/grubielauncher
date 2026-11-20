import { useTranslation } from "react-i18next";
import {
  Archive,
  BarChart3,
  CalendarClock,
  Clock,
  Copy,
  Footprints,
  FolderOpen,
  HardDrive,
  Map as MapIcon,
  MapPin,
  Skull,
  Sprout,
  Swords,
  TriangleAlert,
} from "lucide-react";
import { IWorld } from "@/types/World";
import { Version } from "@renderer/classes/Version";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { formatDate, formatRelative } from "@renderer/utilities/date";
import { formatBytes } from "@renderer/utilities/file";
import { shortenPath } from "@renderer/features/instances/instanceOverview";
import { worldDisplayStats } from "@renderer/utilities/worldStats";
import {
  formatSpawn,
  isWorldVersionMismatch,
  worldAgeDays,
} from "./worldFacts";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { formatDuration } from "@renderer/utilities/duration";
import { formatNumber } from "@renderer/utilities/numbers";
import { AdvancementsSummary, WorldAdvancementsState } from "./WorldAdvancements";
import { openSeedMap, worldSeedMapUrl } from "./worldActions";

const api = window.api;

export function WorldOverviewTab({
  world,
  version,
  sizeBytes,
  backupCount,
  locale,
  advancements,
  onOpenStats,
}: {
  world: IWorld;
  version: Version;
  sizeBytes: number | null;
  backupCount: number;
  locale: string;
  advancements: WorldAdvancementsState;
  onOpenStats: () => void;
}) {
  const { t } = useTranslation();
  const mapUrl = worldSeedMapUrl(world, version);
  const redact = useRedact();
  const stats = worldDisplayStats(world.statistics);
  const nf = (value: number) => formatNumber(value, locale);

  const sizeLabels = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const days = worldAgeDays(world.worldAgeTicks);
  const spawn = formatSpawn(world.spawn);
  const instanceVersion = version.version.version?.id;
  const mismatch = isWorldVersionMismatch(world.versionName, instanceVersion);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {mismatch && (
        <Alert variant="warning" className="shrink-0">
          <TriangleAlert />
          <AlertDescription>
            {t("worlds.versionMismatch", {
              world: world.versionName,
              instance: instanceVersion,
            })}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid flex-1 auto-rows-[minmax(4.5rem,6rem)] grid-cols-2 gap-2 lg:grid-cols-3">
        <Fact
          icon={CalendarClock}
          label={t("worlds.lastPlayed")}
          value={
            world.lastPlayed
              ? formatRelative(new Date(world.lastPlayed))
              : t("worlds.neverPlayed")
          }
          hint={
            world.lastPlayed
              ? formatDate(new Date(world.lastPlayed))
              : undefined
          }
        />
        {stats.hasData && (
          <Fact
            icon={Clock}
            label={t("worlds.playTime")}
            value={formatDuration(Math.floor(stats.playTimeTicks / 20), {
              withSeconds: true,
            })}
          />
        )}
        <Fact
          icon={HardDrive}
          label={t("worlds.size")}
          value={
            sizeBytes === null ? "…" : formatBytes(sizeBytes, sizeLabels, 1)
          }
        />
        {days !== null && (
          <Fact icon={Sprout} label={t("worlds.worldDays")} value={nf(days)} />
        )}
        {stats.hasData && (
          <>
            <Fact
              icon={Skull}
              label={t("versionStatistics.deaths")}
              value={nf(stats.deaths)}
            />
            <Fact
              icon={Swords}
              label={t("versionStatistics.mobKills")}
              value={nf(stats.mobKills)}
            />
            <Fact
              icon={Footprints}
              label={t("versionStatistics.distance")}
              value={`${nf(Math.round(stats.distanceCm / 1000) / 100)} ${t("versionStatistics.km")}`}
            />
          </>
        )}
        {spawn && (
          <Fact icon={MapPin} label={t("worlds.spawn")} value={spawn} mono />
        )}
        <Fact
          icon={Archive}
          label={t("worldBackups.title")}
          value={nf(backupCount)}
        />
      </div>

      <AdvancementsSummary
        state={advancements}
        locale={locale}
        onOpenDetails={onOpenStats}
      />

      {!stats.hasData && (
        <div className="flex shrink-0 items-center gap-2.5 rounded-xl border bg-surface-1 px-3 py-2.5">
          <BarChart3 className="size-4 shrink-0 text-faint" />
          <p className="min-w-0 text-xs text-muted-foreground">
            {t("worlds.statsLater")}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-xl border bg-surface-1 py-1.5 pr-1.5 pl-3">
        <span className="shrink-0 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("worlds.seed")}
        </span>

        <Hint
          content={redact.value(world.seed) || undefined}
          variant="text"
          truncatedOnly
        >
          <span className="min-w-0 flex-1 truncate text-right font-mono text-sm tabular-nums">
            {redact.value(world.seed) || (
              <span className="font-sans text-xs text-faint">
                {t("worlds.noSeed")}
              </span>
            )}
          </span>
        </Hint>

        <Hint content={t("common.copy")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 text-muted-foreground"
            disabled={!world.seed}
            aria-label={t("common.copy")}
            onClick={async () => {
              await copyWithFeedback(world.seed);
            }}
          >
            <Copy className="size-3.5" />
          </Button>
        </Hint>

        <Hint content={t("worlds.seedMapHint")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 text-muted-foreground"
            disabled={!mapUrl}
            aria-label={t("worlds.seedMapHint")}
            onClick={() => mapUrl && openSeedMap(mapUrl, t)}
          >
            <MapIcon className="size-3.5" />
          </Button>
        </Hint>
      </div>

      <div className="flex items-center gap-2 rounded-xl border bg-surface-1 py-1.5 pr-1.5 pl-3">
        <span className="shrink-0 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("worlds.folder")}
        </span>

        <Hint content={redact.path(world.path)} variant="text">
          <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-faint">
            <bdi>{shortenPath(redact.path(world.path))}</bdi>
          </span>
        </Hint>

        <Hint content={t("worlds.openFolder")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={t("worlds.openFolder")}
            onClick={() => void api.shell.openPath(world.path)}
          >
            <FolderOpen className="size-3.5" />
          </Button>
        </Hint>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  hint,
  mono,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <Hint
      content={hint ?? `${label}: ${value}`}
      variant="text"
      truncatedOnly={!hint}
    >
      <div className="flex min-w-0 items-center gap-2.5 rounded-xl border bg-surface-1 px-3">
        <Icon className="size-4 shrink-0 text-faint" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-3xs leading-none text-faint">
            {label}
          </span>
          <span
            className={`truncate leading-tight font-semibold tabular-nums ${
              mono ? "font-mono text-base" : "text-lg"
            }`}
          >
            {value}
          </span>
        </div>
      </div>
    </Hint>
  );
}
