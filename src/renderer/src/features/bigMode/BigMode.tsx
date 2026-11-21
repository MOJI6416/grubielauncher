import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Loader2, LogIn, Minimize2, PackagePlus, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import { BrandMark } from "@renderer/shell/BrandMark";
import {
  accountAtom,
  isRunningAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { AccountHead } from "@renderer/features/accounts/AccountHead";
import { InstanceArt } from "@renderer/features/instances/InstanceArt";
import {
  activityTime,
  instanceKey,
} from "@renderer/features/instances/selectors";
import {
  instanceStatsAtom,
  runningSessionsAtom,
} from "@renderer/features/instances/instanceStats";
import { instancePinnedAtom } from "@renderer/features/instances/instancesStore";
import {
  countMods,
  instanceLastLaunch,
} from "@renderer/features/instances/contentCounts";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { openInstanceScreen } from "@renderer/features/instances/openInstanceScreen";
import { dockEntries } from "@renderer/features/layout/layout";
import { LaunchStageStrip } from "@renderer/features/launch/LaunchStageStrip";
import { launchProgressAtom } from "@renderer/features/launch/launchProgress";
import { InstallStageStrip } from "@renderer/features/install/InstallStageStrip";
import { installingVersionAtom } from "@renderer/features/install/installUi";
import { openAddAccount } from "@renderer/features/accounts/addAccountRequest";
import { countFeature } from "@renderer/features/usage/usage";
import { useGamepadPress } from "@renderer/features/gamepad/gamepadEvents";
import { enterScope, topLayer } from "@renderer/features/gamepad/gamepadNav";
import { playInstance } from "@renderer/features/gamepad/playCurrent";
import { formatRelative } from "@renderer/utilities/date";
import { formatDuration } from "@renderer/utilities/duration";
import { formatNumber } from "@renderer/utilities/numbers";
import { closeBigMode } from "./bigModeStore";

const STAGE = { width: 1280, height: 720 };

export function stageFor(width: number, height: number) {
  const zoom = Math.max(
    1,
    Math.min(width / STAGE.width, height / STAGE.height),
  );
  return { zoom, width: width / zoom, height: height / zoom };
}

function useStage() {
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(() =>
    stageFor(window.innerWidth, window.innerHeight),
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setStage(stageFor(node.clientWidth, node.clientHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, stage };
}

function ButtonGlyph({ label }: { label: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 font-mono text-sm font-semibold text-foreground">
      {label}
    </span>
  );
}

export function BigMode() {
  const { t } = useTranslation();
  const { ref, stage } = useStage();
  const versions = useAtomValue(versionsAtom);
  const pinned = useAtomValue(instancePinnedAtom);
  const account = useAtomValue(accountAtom);
  const isLaunching = useAtomValue(isRunningAtom);
  const sessions = useAtomValue(runningSessionsAtom);
  const stats = useAtomValue(instanceStatsAtom);
  const launch = useAtomValue(launchProgressAtom);
  const installingVersion = useAtomValue(installingVersionAtom);

  const ordered = useMemo(
    () =>
      dockEntries(
        [...versions].sort((a, b) => activityTime(b) - activityTime(a)),
        { key: instanceKey, pinned, hidden: [], limit: 0 },
      ),
    [versions, pinned],
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const pointerSelected = useRef(false);
  const selected =
    ordered.find((instance) => instanceKey(instance) === selectedKey) ??
    ordered[0];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (ref.current && !topLayer()) enterScope(ref.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [ref]);

  const play = (instance: Version | undefined) => {
    if (playInstance(instance)) countFeature("bigMode.play");
  };

  const openInLauncher = (instance: Version | undefined) => {
    if (!instance) return;
    closeBigMode();
    openInstanceScreen(instance, account);
  };

  const signIn = () => {
    closeBigMode();
    navigate({ name: "accounts" });
    openAddAccount();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || topLayer())
        return;
      event.preventDefault();
      closeBigMode();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useGamepadPress((button) => {
    if (topLayer()) return false;
    if (button === "b" || button === "view") {
      closeBigMode();
      return true;
    }
    if (button === "start") {
      play(selected);
      return true;
    }
    if (button === "y") {
      openInLauncher(selected);
      return true;
    }
    return false;
  });

  const key = selected ? instanceKey(selected) : null;
  const statistics = key ? stats[key] : undefined;
  const session = selected
    ? sessions.find((entry) => entry.versionName === selected.version.name)
    : undefined;
  const launchHere =
    selected && launch?.versionName === selected.version.name ? launch : null;
  const installingHere =
    !!selected && installingVersion === selected.version.name;
  const lastLaunchedAt = selected
    ? instanceLastLaunch(selected.version.lastLaunch, statistics)
    : null;
  const modsCount = selected ? countMods(selected.version.loader.mods) : 0;
  const canPlay = !!account && !isLaunching;

  return (
    <div
      ref={ref}
      data-gamepad-scope="big-mode"
      className="fixed inset-x-0 bottom-0 z-40 overflow-hidden bg-background"
      style={{ top: "env(titlebar-area-height, 0px)" }}
    >
      <div
        className="flex flex-col gap-5 px-12 py-6"
        style={{ zoom: stage.zoom, width: stage.width, height: stage.height }}
      >
        <header className="flex h-12 shrink-0 items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-xl bg-surface-2 text-primary">
            <BrandMark className="size-6" />
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Grubie Launcher
          </span>
          {account && (
            <span className="ml-auto flex min-w-0 items-center gap-3 rounded-xl bg-surface-2 py-1.5 pr-4 pl-1.5">
              <AccountHead account={account} size={36} className="rounded-lg" />
              <Hint content={account.nickname} variant="text" truncatedOnly>
                <span className="max-w-64 truncate text-lg font-medium text-foreground">
                  {account.nickname}
                </span>
              </Hint>
            </span>
          )}
        </header>

        {selected ? (
          <section className="flex min-h-0 flex-1 items-center gap-10 rounded-3xl bg-card px-10 py-8">
            <InstanceArt
              name={selected.version.name}
              image={selected.version.image}
              eager
              className="size-48 rounded-3xl"
              textClassName="font-mono text-6xl"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              <div className="flex min-w-0 flex-col gap-2">
                <Hint
                  content={selected.version.name}
                  variant="text"
                  truncatedOnly
                >
                  <h1 className="truncate font-display text-5xl leading-tight font-semibold tracking-tight text-foreground">
                    {selected.version.name}
                  </h1>
                </Hint>
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xl text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {selected.version.version?.id}
                  </span>
                  <LoaderLabel loader={selected.version.loader.name} />
                  {modsCount > 0 && (
                    <span>
                      {t("modManager.modsCount", { count: modsCount })}
                    </span>
                  )}
                </div>
                {launchHere ? (
                  <div className="max-w-xl">
                    <LaunchStageStrip progress={launchHere} />
                  </div>
                ) : installingHere ? (
                  <div className="max-w-xl">
                    <InstallStageStrip />
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-lg text-faint">
                    {session ? (
                      <span className="text-success">
                        {t("bigMode.inGame")}
                      </span>
                    ) : (
                      <span>
                        {t("versionStatistics.lastLaunch")}:{" "}
                        {lastLaunchedAt
                          ? formatRelative(lastLaunchedAt)
                          : t("versions.never")}
                      </span>
                    )}
                    {!!statistics?.playTime && (
                      <span className="whitespace-nowrap tabular-nums">
                        {t("versionStatistics.playTime")}:{" "}
                        {formatDuration(Math.round(statistics.playTime))}
                      </span>
                    )}
                    {!!statistics?.launches && (
                      <span className="whitespace-nowrap tabular-nums">
                        {t("home.stats.launches")}:{" "}
                        {formatNumber(statistics.launches)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                {account ? (
                  <Button
                    size="lg"
                    data-gamepad-entry
                    disabled={!canPlay}
                    onClick={() => play(selected)}
                    className="h-16 gap-3 rounded-2xl px-10 text-2xl font-semibold [&_svg]:size-7"
                  >
                    {isLaunching ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Play />
                    )}
                    {session ? t("versions.playAnotherShort") : t("nav.play")}
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    data-gamepad-entry
                    onClick={signIn}
                    className="h-16 gap-3 rounded-2xl px-10 text-2xl font-semibold [&_svg]:size-7"
                  >
                    <LogIn />
                    {t("accounts.signIn")}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => openInLauncher(selected)}
                  className="h-16 rounded-2xl px-8 text-xl"
                >
                  {t("versions.openInstance")}
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card p-10 text-center">
            <PackagePlus className="size-16 text-faint" />
            <div className="flex flex-col gap-2">
              <p className="font-display text-4xl font-semibold text-foreground">
                {t("bigMode.emptyTitle")}
              </p>
              <p className="text-xl text-muted-foreground">
                {t("bigMode.emptyDescription")}
              </p>
            </div>
            <Button
              size="lg"
              data-gamepad-entry
              onClick={() => {
                closeBigMode();
                openNewInstance();
              }}
              className="h-14 rounded-2xl px-8 text-xl"
            >
              <PackagePlus />
              {t("shell.nav.newInstance")}
            </Button>
          </section>
        )}

        {ordered.length > 0 && (
          <section className="flex shrink-0 flex-col gap-3">
            <p className="text-lg font-semibold text-muted-foreground">
              {t("shell.nav.instances")}
              <span className="ml-2 font-mono text-base text-faint tabular-nums">
                {ordered.length}
              </span>
            </p>
            <div
              role="list"
              data-gamepad-row
              className="-mx-3 flex gap-4 overflow-x-auto px-3 py-2 [scrollbar-width:none]"
            >
              {ordered.map((instance) => {
                const tileKey = instanceKey(instance);
                const isSelected = tileKey === key;
                return (
                  <div role="listitem" key={tileKey} className="shrink-0">
                    <button
                      type="button"
                      onPointerDown={() => {
                        pointerSelected.current = isSelected;
                      }}
                      onFocus={() => setSelectedKey(tileKey)}
                      onClick={(event) => {
                        if (event.detail > 0 && !pointerSelected.current)
                          return;
                        play(instance);
                      }}
                      aria-label={instance.version.name}
                      data-gamepad-current={isSelected || undefined}
                      className={cn(
                        "flex w-36 flex-col gap-2 rounded-2xl p-2 text-left transition-[transform,background-color] duration-(--dur-fast) outline-none",
                        "hover:bg-surface-2 focus:scale-105 focus:bg-surface-2 focus:ring-4 focus:ring-ring",
                        isSelected && "bg-surface-2",
                      )}
                    >
                      <InstanceArt
                        name={instance.version.name}
                        image={instance.version.image}
                        className="size-32 rounded-xl"
                        textClassName="font-mono text-4xl"
                      />
                      <Hint
                        content={instance.version.name}
                        variant="text"
                        truncatedOnly
                      >
                        <span className="truncate px-1 text-lg font-medium text-foreground">
                          {instance.version.name}
                        </span>
                      </Hint>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer className="flex h-10 shrink-0 items-center gap-8 text-lg text-muted-foreground">
          <span className="flex items-center gap-2.5">
            <ButtonGlyph label="A" />
            {t("nav.play")}
          </span>
          <span className="flex items-center gap-2.5">
            <ButtonGlyph label="Y" />
            {t("versions.openInstance")}
          </span>
          <Button
            variant="ghost"
            size="lg"
            onClick={closeBigMode}
            className="ml-auto h-10 gap-2.5 rounded-xl px-3 text-lg text-muted-foreground"
          >
            <ButtonGlyph label="B" />
            {t("bigMode.exit")}
            <Minimize2 className="text-faint" />
          </Button>
        </footer>
      </div>
    </div>
  );
}
