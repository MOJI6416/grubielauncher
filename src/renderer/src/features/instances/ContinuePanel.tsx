import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  ChevronRight,
  Compass,
  Play,
  Server,
  Skull,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { accountAtom, isRunningAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import type { InstanceTab } from "@renderer/navigation/routes";
import { formatRelative } from "@renderer/utilities/date";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import {
  ServerFavicon,
  StatusDot,
} from "@renderer/features/servers/ServerVisuals";
import { useServerStatuses } from "@renderer/features/servers/useServerStatuses";
import type { RunGameParams } from "@renderer/features/launch/types";
import {
  ContinueServer,
  ContinueTab,
  ContinueTabs,
  ContinueTarget,
  continueAllTab,
  continueListTab,
} from "./continueTargets";
import { instanceKey } from "./selectors";
import { useContinueTargets } from "./useContinueTargets";

export function ContinuePanel({
  instance,
  runGame,
}: {
  instance: Version;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const { status, targets, total, worlds, hasSaves, servers } =
    useContinueTargets(instance, 2);
  const account = useAtomValue(accountAtom);
  const isLaunching = useAtomValue(isRunningAtom);
  const { t } = useTranslation();

  const addresses = useMemo(
    () =>
      targets
        .filter((target): target is ContinueServer => target.kind === "server")
        .map((target) => target.address),
    [targets],
  );
  const serverStatuses = useServerStatuses(addresses, status === "ready");

  const openTab = (tab: InstanceTab) =>
    navigate({ name: "instance", id: instanceKey(instance), tab });

  const tabs: ContinueTabs = {
    worlds: hasSaves,
    servers: !!instance.version.version.serverManager,
  };

  const canQuick = (target: ContinueTarget) =>
    target.kind === "world"
      ? instance.isQuickPlaySingleplayer
      : instance.isQuickPlayMultiplayer;

  const destinationOf = (
    target: ContinueTarget,
  ): ContinueTab | "quick" | null =>
    canQuick(target) && account && !isLaunching
      ? "quick"
      : continueListTab(target.kind, tabs);

  const allTab = continueAllTab({ worlds, servers }, tabs);

  const activate = (target: ContinueTarget) => {
    const destination = destinationOf(target);
    if (!destination) return;

    if (destination !== "quick") {
      openTab(destination);
      return;
    }

    void runGame({
      version: instance,
      quick:
        target.kind === "world"
          ? { single: target.folderName }
          : { multiplayer: target.address },
    });
  };

  const shortcuts: Array<{
    id: InstanceTab;
    icon: typeof Compass;
    label: string;
    count: number;
    available: boolean;
    pending?: boolean;
  }> = [
    {
      id: "worlds",
      icon: Compass,
      label: t("shell.tabs.worlds"),
      count: worlds,
      available: tabs.worlds,
      pending: status === "loading",
    },
    {
      id: "servers",
      icon: Server,
      label: t("shell.tabs.servers"),
      count: servers,
      available: tabs.servers,
      pending: status === "loading",
    },
    {
      id: "content",
      icon: Boxes,
      label: t("shell.tabs.content"),
      count: instance.version.loader.mods?.length ?? 0,
      available: true,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 border-l border-border bg-surface-1/70 px-3 py-3 backdrop-blur-sm">
      <div className="flex h-5 shrink-0 items-center gap-2">
        <span className="text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
          {t("home.continue.title")}
        </span>
        {total > targets.length && (
          <span className="font-mono text-[0.65rem] text-faint">
            +{total - targets.length}
          </span>
        )}
        {allTab && (
          <button
            type="button"
            onClick={() => openTab(allTab)}
            className="ml-auto flex shrink-0 items-center gap-0.5 rounded text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t("home.continue.all")}
            <ChevronRight className="size-3" />
          </button>
        )}
      </div>

      {status === "loading" ? (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ) : targets.length === 0 ? (
        <p className="px-1.5 text-[0.7rem] leading-snug text-faint">
          {t("home.continue.empty")}
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-1.5">
          {targets.map((target) => {
            const quick = canQuick(target);
            const destination = destinationOf(target);
            const ping =
              target.kind === "server"
                ? serverStatuses[target.address]
                : undefined;
            const subtitle =
              target.kind === "world"
                ? target.lastPlayed > 0
                  ? formatRelative(new Date(target.lastPlayed))
                  : t("worlds.neverPlayed")
                : target.address;
            const players =
              ping?.state === "online" && ping.players
                ? `${ping.players.online}/${ping.players.max}`
                : "";

            return (
              <li key={target.id}>
                <Hint
                  variant="text"
                  side="left"
                  content={
                    quick
                      ? undefined
                      : target.kind === "world"
                        ? t("home.continue.quickUnsupported")
                        : t("home.continue.quickUnsupportedServer")
                  }
                >
                  <button
                    type="button"
                    aria-disabled={!destination}
                    onClick={() => activate(target)}
                    className={cn(
                      "group flex h-11 w-full items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      destination
                        ? "hover:bg-surface-3"
                        : "cursor-default opacity-60",
                    )}
                  >
                    {target.kind === "world" ? (
                      <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-3">
                        {resolveLocalImage(target.icon) ? (
                          <img
                            src={resolveLocalImage(target.icon)}
                            alt=""
                            draggable={false}
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <Compass className="size-3.5 text-faint" />
                        )}
                      </span>
                    ) : (
                      <ServerFavicon
                        icon={ping?.result?.favicon ?? target.icon}
                        size={28}
                      />
                    )}

                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-center gap-1">
                        {target.kind === "world" && target.hardcore && (
                          <Skull className="size-3 shrink-0 text-destructive" />
                        )}
                        <span className="truncate text-xs font-medium text-foreground">
                          {target.name}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[0.65rem] text-faint">
                        {target.kind === "server" && (
                          <StatusDot state={ping?.state ?? "pending"} />
                        )}
                        <span className="min-w-0 truncate">{subtitle}</span>
                        {players && (
                          <span className="shrink-0 font-mono tabular-nums">
                            {players}
                          </span>
                        )}
                      </span>
                    </span>

                    <Play
                      className={cn(
                        "size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                        !quick && "hidden",
                      )}
                    />
                  </button>
                </Hint>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex shrink-0 items-center gap-1 border-t border-border pt-1.5">
        {shortcuts.map((shortcut) => (
          <Hint key={shortcut.id} content={shortcut.label}>
            <button
              type="button"
              aria-label={shortcut.label}
              aria-disabled={!shortcut.available}
              onClick={() => shortcut.available && openTab(shortcut.id)}
              className={cn(
                "flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg text-faint transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                shortcut.available
                  ? "hover:bg-surface-3 hover:text-muted-foreground"
                  : "cursor-default opacity-45",
              )}
            >
              <shortcut.icon className="size-3.5 shrink-0" />
              <span className="font-mono text-[0.7rem] tabular-nums">
                {shortcut.pending ? "…" : shortcut.count}
              </span>
            </button>
          </Hint>
        ))}
      </div>
    </div>
  );
}
