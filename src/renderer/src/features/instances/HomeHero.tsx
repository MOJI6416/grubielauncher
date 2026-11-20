import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Ellipsis,
  Folder,
  Loader2,
  LogIn,
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
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import {
  accountAtom,
  accountsAtom,
  installActiveAtom,
  isRunningAtom,
  networkAtom,
} from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { openAddAccount } from "@renderer/features/accounts/addAccountRequest";
import type { InstanceTab } from "@renderer/navigation/routes";
import { formatRelative } from "@renderer/utilities/date";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { useCountUp } from "@renderer/utilities/useCountUp";
import type { RunGameParams } from "@renderer/features/launch/types";
import { InstallStageStrip } from "@renderer/features/install/InstallStageStrip";
import { installingVersionAtom } from "@renderer/features/install/installUi";
import { LaunchCompanion } from "@renderer/features/launch/LaunchCompanion";
import { LaunchStageStrip } from "@renderer/features/launch/LaunchStageStrip";
import { launchProgressAtom } from "@renderer/features/launch/launchProgress";
import { ContinuePanel } from "./ContinuePanel";
import { InstanceArt, loaderTint } from "./InstanceArt";
import { InstanceStatusChip } from "./InstanceStatusChip";
import { OwnerMark } from "./InstanceCard";
import { resolveOwnerMark } from "./ownerMark";
import { InstanceUpdateBadge } from "./InstanceUpdateBadge";
import { countMods, instanceLastLaunch } from "./contentCounts";
import { duplicateInstance } from "./duplicateInstance";
import { openPortDialog } from "@renderer/features/port/portStore";
import { buildInstanceActions } from "./instanceActions";
import { requestInstanceDelete } from "./deleteStore";
import { instanceStatsAtom, runningSessionsAtom } from "./instanceStats";
import { instanceTagsAtom } from "./instancesStore";
import { instanceUpdatesAtom } from "./updateCheck";
import { modpackUpdatesAtom } from "@renderer/features/modpack/modpackCatalog";
import { resolveInstanceStatuses } from "./instanceStatus";
import { openInstanceScreen } from "./openInstanceScreen";
import { instanceKey } from "./selectors";
import { isSlotHidden, slotId } from "@renderer/features/layout/layout";
import { useLayout } from "@renderer/features/layout/useLayout";
import { formatClock, formatDuration } from "@renderer/utilities/duration";

const HERO_BUTTONS = new Set(["overview", "folder"]);

type HeroCell = {
  id: string;
  label: string;
  value: string | { count: number; format: (value: number) => string };
};

function CountUpValue({
  count,
  format,
}: {
  count: number;
  format: (value: number) => string;
}) {
  return <>{format(useCountUp(count))}</>;
}

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
  const accounts = useAtomValue(accountsAtom);
  const isLaunching = useAtomValue(isRunningAtom);
  const isInstallActive = useAtomValue(installActiveAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const sessions = useAtomValue(runningSessionsAtom);
  const stats = useAtomValue(instanceStatsAtom);
  const updates = useAtomValue(instanceUpdatesAtom);
  const modpackUpdates = useAtomValue(modpackUpdatesAtom);
  const tags = useAtomValue(instanceTagsAtom);
  const launch = useAtomValue(launchProgressAtom);
  const installingVersion = useAtomValue(installingVersionAtom);
  const [now, setNow] = useState(() => Date.now());
  const { t } = useTranslation();
  const layout = useLayout();
  const showStats = !isSlotHidden(layout, slotId.home("stats"));
  const showContinue = !isSlotHidden(layout, slotId.home("continue"));

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

  const ownerMark = resolveOwnerMark(instance, account, accounts);
  const statistics = stats[key];
  const image = resolveLocalImage(instance.version.image);
  const modsCount = countMods(instance.version.loader.mods);
  const instanceTags = tags[key] ?? [];
  const tagLine = instanceTags.map((tag) => `#${tag}`).join(" ");
  const canPlay = !!account && !isLaunching;
  const isRunningInstance = !!session && !isLaunching;
  const launchHere =
    launch?.versionName === instance.version.name ? launch : null;
  const installingHere = installingVersion === instance.version.name;
  const waiting = !!launchHere || installingHere;

  const statuses = resolveInstanceStatuses({
    running: !!session,
    installed: instance.hasManifest,
    update: updates[key] ?? (modpackUpdates[key] ? "behind" : undefined),
  });

  const actions = buildInstanceActions({
    instance,
    t,
    canPlay,
    isRunningInstance,
    onPlay: () => void runGame({ version: instance }),
    onPlayAnother: () => void runGame({ version: instance }),
    onManageTags: () => onManageTags(key, instance.version.name),
    onDuplicate: () => void duplicateInstance(instance),
    onPort: () => openPortDialog(instance),
    onDelete: () => requestInstanceDelete(instance),
    account,
    isBusy: isLaunching || isInstallActive,
  });

  const menuGroups = actions
    .slice(1)
    .map((group) => group.filter((action) => !HERO_BUTTONS.has(action.id)))
    .filter((group) => group.length > 0);

  const openInstance = (tab?: InstanceTab) =>
    openInstanceScreen(instance, account, { tab, morphFrom: "hero" });

  const lastLaunchedAt = instanceLastLaunch(
    instance.version.lastLaunch,
    statistics,
  );

  const formatHours = (value: number) => formatDuration(Math.round(value));

  const cells: HeroCell[] = [
    {
      id: "playtime",
      label: t("versionStatistics.playTime"),
      value: statistics?.playTime
        ? { count: statistics.playTime, format: formatHours }
        : formatDuration(undefined),
    },
    {
      id: "launches",
      label: t("home.stats.launches"),
      value: statistics
        ? {
            count: statistics.launches ?? 0,
            format: (value) => String(Math.round(value)),
          }
        : "—",
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
      value: { count: statistics.longestSessionSec, format: formatHours },
    });
  }

  return (
    <section className="surface-lit relative flex h-full overflow-hidden rounded-2xl border border-border bg-card">
      {image ? (
        <>
          <img
            src={image}
            alt=""
            aria-hidden
            draggable={false}
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 h-full w-3/5 scale-110 object-cover opacity-45 blur-2xl select-none [mask-image:linear-gradient(to_right,transparent,black_60%)]",
              waiting && "hero-drift",
            )}
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

      {waiting && (
        <>
          <span
            aria-hidden
            className="launch-glow absolute -bottom-20 -left-12 size-60 rounded-full"
          />
          <span aria-hidden className="milestone-marker" data-state="on" />
        </>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col justify-between p-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <div className="relative shrink-0">
            <InstanceArt
              eager
              morph="hero"
              name={instance.version.name}
              image={instance.version.image}
              className="size-14 rounded-xl"
              textClassName="text-base"
            />
            {ownerMark && (
              <OwnerMark
                nickname={ownerMark.nickname}
                image={ownerMark.image}
                hint={
                  instance.version.downloadedVersion
                    ? t("versions.ownerUpdatesHint", {
                        nickname: ownerMark.nickname,
                      })
                    : undefined
                }
                className="absolute -right-1.5 -bottom-1.5 size-5 ring-card"
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 text-[1.35rem] leading-tight font-bold tracking-tight">
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
                        ? formatClock(now - session.startTime)
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
                <Hint content={tagLine} variant="text" truncatedOnly>
                  <span className="truncate text-faint">{tagLine}</span>
                </Hint>
              )}
            </div>
          </div>
        </div>

        {launchHere ? (
          <LaunchStageStrip progress={launchHere} />
        ) : installingHere ? (
          <InstallStageStrip />
        ) : !showStats ? null : (
          <div className="flex min-w-0 gap-6">
            {cells.map((cell) => (
              <Hint
                key={cell.id}
                variant="text"
                truncatedOnly
                content={`${cell.label}: ${
                  typeof cell.value === "string"
                    ? cell.value
                    : cell.value.format(cell.value.count)
                }`}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-3xs tracking-[0.06em] text-faint uppercase">
                    {cell.label}
                  </span>
                  <span className="truncate text-sm font-semibold tabular-nums">
                    {typeof cell.value === "string" ? (
                      cell.value
                    ) : (
                      <CountUpValue
                        count={cell.value.count}
                        format={cell.value.format}
                      />
                    )}
                  </span>
                </div>
              </Hint>
            ))}
          </div>
        )}

        <div className="flex min-w-0 items-center gap-2">
          {account ? (
            <Hint
              content={
                isRunningInstance && canPlay
                  ? t("versions.playAnotherInstance")
                  : undefined
              }
            >
              <Button
                size="lg"
                disabled={!canPlay}
                className="btn-sheen h-11 px-7 text-base font-semibold active:scale-[0.97] [&_svg]:size-5"
                onClick={() => void runGame({ version: instance })}
              >
                {isLaunching ? <Loader2 className="animate-spin" /> : <Play />}
                {isRunningInstance
                  ? t("versions.playAnotherShort")
                  : t("nav.play")}
              </Button>
            </Hint>
          ) : (
            <Button
              size="lg"
              className="h-11 px-7 text-base font-semibold active:scale-[0.97] [&_svg]:size-5"
              onClick={() =>
                accounts.length > 0
                  ? navigate({ name: "accounts" })
                  : openAddAccount()
              }
            >
              <LogIn />
              {t("accounts.signIn")}
            </Button>
          )}

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
                      variant={action.destructive ? "destructive" : "default"}
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
            <Hint content={t("home.signInHint")} variant="text" truncatedOnly>
              <span className="ml-1 min-w-0 truncate text-xs text-muted-foreground">
                {t("home.signInHint")}
              </span>
            </Hint>
          ) : (
            !isBackendOnline && (
              <Hint content={t("home.offlineHint")}>
                <span className="ml-1 cursor-default text-xs text-faint">
                  {t("home.offline")}
                </span>
              </Hint>
            )
          )}
        </div>
      </div>

      {(waiting || showContinue) && (
        <div className="relative w-72 shrink-0">
          {waiting ? (
            <div className="size-full animate-in duration-500 fade-in">
              <LaunchCompanion
                instance={instance}
                caption={launchHere ? t("launchStage.minimizeHint") : undefined}
              />
            </div>
          ) : (
            <ContinuePanel instance={instance} runGame={runGame} />
          )}
        </div>
      )}
    </section>
  );
}
