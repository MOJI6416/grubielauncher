import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Ellipsis,
  Folder,
  Loader2,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import {
  accountAtom,
  isRunningAtom,
  networkAtom,
} from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import type { InstanceTab } from "@renderer/navigation/routes";
import { formatRelative } from "@renderer/utilities/date";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import type { RunGameParams } from "@renderer/features/launch/types";
import { ContinuePanel } from "./ContinuePanel";
import { InstanceArt, loaderTint } from "./InstanceArt";
import { InstanceStatusChip } from "./InstanceStatusChip";
import { InstanceUpdateBadge } from "./InstanceUpdateBadge";
import { countMods, instanceLastLaunch } from "./contentCounts";
import { buildInstanceActions } from "./instanceActions";
import { instanceFlagsAtom } from "./atoms";
import { instanceStatsAtom, runningSessionsAtom } from "./instanceStats";
import { instanceTagsAtom } from "./instancesStore";
import { instanceUpdatesAtom } from "./updateCheck";
import { formatPlaytime, formatSessionClock } from "./playtime";
import { resolveInstanceStatuses } from "./instanceStatus";
import { selectInstance } from "./selectInstance";
import { instanceKey } from "./selectors";

const HERO_BUTTONS = new Set(["overview", "folder"]);

export function HomeHero({
  instance,
  runGame,
  onManageTags,
}: {
  instance: Version;
  runGame: (params: RunGameParams) => Promise<void>;
  onManageTags: (key: string, name: string) => void;
}) {
  const account = useAtomValue(accountAtom);
  const isLaunching = useAtomValue(isRunningAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const sessions = useAtomValue(runningSessionsAtom);
  const stats = useAtomValue(instanceStatsAtom);
  const updates = useAtomValue(instanceUpdatesAtom);
  const flags = useAtomValue(instanceFlagsAtom);
  const tags = useAtomValue(instanceTagsAtom);
  const [now, setNow] = useState(() => Date.now());
  const { t } = useTranslation();

  const key = instanceKey(instance);
  const session = useMemo(
    () =>
      sessions
        .filter((entry) => entry.versionName === instance.version.name)
        .sort((a, b) => a.startTime - b.startTime)[0],
    [sessions, instance.version.name],
  );

  useEffect(() => {
    if (!session) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);

  const statistics = stats[key];
  const image = resolveLocalImage(instance.version.image);
  const modsCount = countMods(instance.version.loader.mods);
  const instanceTags = tags[key] ?? [];
  const canPlay = !!account && !isLaunching;

  const statuses = resolveInstanceStatuses({
    running: !!session,
    installed: instance.hasManifest,
    update: updates[key],
    downloaded: instance.version.downloadedVersion,
  });

  const actions = buildInstanceActions({
    instance,
    t,
    canPlay,
    isRunningInstance: !!session,
    hasSaves: flags[key]?.hasSaves === true,
    hasServer: flags[key]?.hasServer === true,
    hasStatistics: !!statistics,
    onPlay: () => void runGame({ version: instance }),
    onPlayAnother: () => void runGame({ version: instance }),
    onManageTags: () => onManageTags(key, instance.version.name),
  });

  const menuGroups = actions
    .slice(1)
    .map((group) => group.filter((action) => !HERO_BUTTONS.has(action.id)))
    .filter((group) => group.length > 0);

  const openInstance = (tab?: InstanceTab) => {
    void selectInstance(instance, account);
    navigate({ name: "instance", id: key, tab });
  };

  const timeLabels = { h: t("time.h"), m: t("time.m") };
  const lastLaunchedAt = instanceLastLaunch(
    instance.version.lastLaunch,
    statistics,
  );

  const cells = [
    {
      id: "playtime",
      label: t("versionStatistics.playTime"),
      value: formatPlaytime(statistics?.playTime, timeLabels),
    },
    {
      id: "launches",
      label: t("home.stats.launches"),
      value: statistics ? String(statistics.launches ?? 0) : "—",
    },
    {
      id: "last",
      label: t("versionStatistics.lastLaunch"),
      value: lastLaunchedAt
        ? formatRelative(lastLaunchedAt)
        : t("versions.never"),
    },
  ];

  if (statistics?.longestSessionSec) {
    cells.push({
      id: "longest",
      label: t("home.stats.longestSession"),
      value: formatPlaytime(statistics.longestSessionSec, timeLabels),
    });
  }

  return (
    <section className="relative flex h-full overflow-hidden rounded-2xl border border-border bg-card">
      {image ? (
        <>
          <img
            src={image}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute inset-y-0 right-0 h-full w-3/5 scale-110 object-cover opacity-45 blur-2xl select-none [mask-image:linear-gradient(to_right,transparent,black_60%)]"
          />
          <img
            src={image}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute top-1/2 right-8 size-30 -translate-y-1/2 rounded-2xl object-cover opacity-15 select-none"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/70 to-transparent" />
        </>
      ) : (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-l to-transparent",
            loaderTint(instance.version.loader.name),
          )}
        />
      )}

      <div className="relative flex min-w-0 flex-1 flex-col justify-between p-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <InstanceArt
            eager
            name={instance.version.name}
            image={instance.version.image}
            className="size-14 rounded-xl"
            textClassName="text-base"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 truncate text-[1.35rem] leading-tight font-bold tracking-tight">
                <Hint
                  content={instance.version.name}
                  variant="text"
                  truncatedOnly
                >
                  <button
                    type="button"
                    onClick={() => openInstance()}
                    className="max-w-full cursor-pointer truncate rounded transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {instance.version.name}
                  </button>
                </Hint>
              </h2>

              {statuses.map((kind) =>
                kind === "update" ? (
                  <InstanceUpdateBadge
                    key={kind}
                    itemKey={key}
                    isDownloaded={instance.version.downloadedVersion}
                    onOpen={() => openInstance()}
                  />
                ) : (
                  <InstanceStatusChip
                    key={kind}
                    kind={kind}
                    detail={
                      kind === "running" && session
                        ? formatSessionClock(now - session.startTime)
                        : undefined
                    }
                  />
                ),
              )}
            </div>

            <div className="flex min-w-0 items-center gap-2.5 text-xs text-muted-foreground">
              <LoaderLabel
                className="shrink-0"
                loader={instance.version.loader.name}
              />
              <span className="shrink-0 font-mono">
                {instance.version.version.id}
              </span>
              {modsCount > 0 && (
                <span className="shrink-0">
                  {t("modManager.modsCount", { count: modsCount })}
                </span>
              )}
              {instanceTags.length > 0 && (
                <span className="truncate text-faint">
                  {instanceTags.map((tag) => `#${tag}`).join(" ")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 gap-6">
          {cells.map((cell) => (
            <div key={cell.id} className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[0.65rem] tracking-[0.06em] text-faint uppercase">
                {cell.label}
              </span>
              <span className="truncate text-sm font-semibold tabular-nums">
                {cell.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="lg"
            disabled={!canPlay}
            className="h-11 px-7 text-base font-semibold [&_svg]:size-5"
            onClick={() => void runGame({ version: instance })}
          >
            {isLaunching ? <Loader2 className="animate-spin" /> : <Play />}
            {session ? t("versions.playAnotherInstance") : t("nav.play")}
          </Button>

          <Hint content={t("versions.openInstance")}>
            <Button
              variant="secondary"
              size="icon"
              className="size-10"
              aria-label={t("versions.openInstance")}
              onClick={() => openInstance()}
            >
              <SlidersHorizontal />
            </Button>
          </Hint>

          <Hint content={t("common.openFolder")}>
            <Button
              variant="secondary"
              size="icon"
              className="size-10"
              aria-label={t("common.openFolder")}
              onClick={() =>
                void window.api.shell.openPath(instance.versionPath)
              }
            >
              <Folder />
            </Button>
          </Hint>

          <DropdownMenu>
            <Hint content={t("common.more")}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-10"
                  aria-label={t("common.more")}
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="start" className="w-56">
              {menuGroups.map((group, index) => (
                <div key={group[0]?.id ?? index}>
                  {index > 0 && <DropdownMenuSeparator />}
                  {group.map((action) => (
                    <DropdownMenuItem
                      key={action.id}
                      disabled={action.disabled}
                      onSelect={action.onSelect}
                    >
                      <action.icon />
                      <span>{action.label}</span>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {!account ? (
            <button
              type="button"
              onClick={() => navigate({ name: "accounts" })}
              className="ml-1 rounded text-xs text-warning underline-offset-2 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t("versions.playBlocked.noAccount")}
            </button>
          ) : (
            !isBackendOnline && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-1 cursor-default text-xs text-faint">
                    {t("home.offline")}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("home.offlineHint")}</TooltipContent>
              </Tooltip>
            )
          )}
        </div>
      </div>

      <div className="relative w-72 shrink-0">
        <ContinuePanel instance={instance} runGame={runGame} />
      </div>
    </section>
  );
}
