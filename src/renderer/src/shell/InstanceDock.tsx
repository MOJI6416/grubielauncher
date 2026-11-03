import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ChevronRight, EyeOff, Pin, PinOff, Plus } from "lucide-react";
import { Hint } from "@renderer/components/Hint";
import { getLoaderInfo } from "@renderer/components/Loaders";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { InstanceArt } from "@renderer/features/instances/InstanceArt";
import {
  accountAtom,
  consolesMetaAtom,
  installActiveAtom,
  isRunningAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import type { Version } from "@renderer/classes/Version";
import type { RunGameParams } from "@renderer/features/launch/types";
import { buildInstanceActions } from "@renderer/features/instances/instanceActions";
import { instanceFlagsAtom } from "@renderer/features/instances/atoms";
import { duplicateInstance } from "@renderer/features/instances/duplicateInstance";
import { requestInstanceDelete } from "@renderer/features/instances/deleteStore";
import { openPortDialog } from "@renderer/features/port/portStore";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "./sidebarCollapse";
import {
  activityTime,
  instanceKey,
} from "@renderer/features/instances/selectors";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { currentRouteAtom } from "@renderer/navigation/store";
import { navigate } from "@renderer/navigation/navigate";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";
import {
  instanceDockHiddenAtom,
  instancePinnedAtom,
} from "@renderer/features/instances/instancesStore";
import type { InstanceAction } from "@renderer/features/instances/instanceActions";
import {
  dockEntries,
  isSlotHidden,
  slotId,
} from "@renderer/features/layout/layout";
import {
  hideFromDock,
  pinInDock,
  toggleSlot,
  useLayout,
  useLayoutEditing,
} from "@renderer/features/layout/useLayout";
import { SlotToggle } from "@renderer/features/layout/SlotToggle";

export function InstanceDock({
  runGame,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const versions = useAtomValue(versionsAtom);
  const consoleMetas = useAtomValue(consolesMetaAtom);
  const isRunning = useAtomValue(isRunningAtom);
  const account = useAtomValue(accountAtom);
  const isInstallActive = useAtomValue(installActiveAtom);
  const flags = useAtomValue(instanceFlagsAtom);
  const collapsed = useSidebarCollapsed();
  const route = useAtomValue(currentRouteAtom);
  const pinned = useAtomValue(instancePinnedAtom);
  const dockHidden = useAtomValue(instanceDockHiddenAtom);
  const layout = useLayout();
  const editing = useLayoutEditing();
  const isSectionHidden = isSlotHidden(layout, slotId.section("dock"));
  const { t } = useTranslation();
  const dockIndicator = useSlidingIndicator<HTMLDivElement>();

  const byActivity = useMemo(
    () => [...versions].sort((a, b) => activityTime(b) - activityTime(a)),
    [versions],
  );

  const ordered = useMemo(
    () =>
      dockEntries(byActivity, {
        key: instanceKey,
        pinned,
        hidden: editing ? [] : dockHidden,
        limit: editing ? 0 : layout.dockLimit,
      }),
    [byActivity, pinned, dockHidden, editing, layout.dockLimit],
  );

  const missing = versions.length - ordered.length;

  const running = useMemo(
    () =>
      new Set(
        consoleMetas
          .filter((meta) => meta.status === "running")
          .map((meta) => meta.versionName),
      ),
    [consoleMetas],
  );

  const activeId = route.name === "instance" ? route.id : null;

  const dockActions = (key: string): InstanceAction[] => {
    const isPinned = pinned.includes(key);
    return [
      {
        id: "pin",
        label: isPinned ? t("layout.unpin") : t("layout.pin"),
        icon: isPinned ? PinOff : Pin,
        onSelect: () => pinInDock(key, !isPinned),
      },
      {
        id: "dock-hide",
        label: t("layout.hideFromSidebar"),
        icon: EyeOff,
        onSelect: () => hideFromDock(key, true),
      },
    ];
  };

  const actionsFor = (instance: Version, key: string) => {
    const groups = buildInstanceActions({
      instance,
      t,
      canPlay: !!account && !isRunning,
      isRunningInstance: running.has(instance.version.name),
      hasSaves: flags[key]?.hasSaves === true,
      hasServer: flags[key]?.hasServer === true,
      hasStatistics: flags[key]?.hasStatistics === true,
      onPlay: () => void runGame({ version: instance }),
      onPlayAnother: () => void runGame({ version: instance }),
      onDuplicate: () => void duplicateInstance(instance),
      onPort: () => openPortDialog(instance),
      onDelete: () => requestInstanceDelete(instance),
      account,
      isBusy: isRunning || isInstallActive,
    });
    return [...groups.slice(0, 3), dockActions(key), ...groups.slice(3)];
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-4">
      <div
        className={cn(
          "flex h-6 shrink-0 items-center gap-1.5",
          !collapsed && "px-2.5",
        )}
      >
        {!collapsed && (
          <span className="text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
            {t("shell.nav.instances")}
          </span>
        )}
        {!collapsed && versions.length > 0 && (
          <span className="font-mono text-[0.65rem] tabular-nums text-faint">
            {versions.length}
          </span>
        )}
        {editing && (
          <SlotToggle
            hidden={isSectionHidden}
            label={t("shell.nav.instances")}
            onToggle={() => toggleSlot(slotId.section("dock"), !isSectionHidden)}
            className="ml-auto"
          />
        )}
        <Hint
          content={t("shell.nav.newInstance")}
          wrapperClassName={collapsed ? "mx-auto" : "ml-auto"}
        >
          <button
            type="button"
            disabled={isRunning}
            data-focus-key="new-instance-dock"
            aria-label={t("shell.nav.newInstance")}
            onClick={() => openNewInstance()}
            className={cn(
              "flex size-5 items-center justify-center rounded-md text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
              collapsed ? "mx-auto" : "ml-auto",
            )}
          >
            <Plus className="size-3.5" />
          </button>
        </Hint>
      </div>

      {ordered.length > 0 && !(editing && isSectionHidden) && (
        <div
          ref={dockIndicator.containerRef}
          className="relative mt-0.5 min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto pr-0.5"
        >
          <SlidingIndicator
            indicator={dockIndicator}
            variant="fill"
            className="rounded-lg bg-primary-soft"
          />
          {ordered.map((instance) => {
            const key = instanceKey(instance);
            const loader = getLoaderInfo(instance.version.loader.name);
            const isActive = key === activeId;
            const isPinned = pinned.includes(key);
            const isHiddenHere = dockHidden.includes(key);

            if (editing) {
              return (
                <div
                  key={key}
                  className={cn(
                    "flex h-10 w-full items-center gap-2.5 rounded-lg pr-1 pl-2.5",
                    isHiddenHere && "opacity-45",
                  )}
                >
                  <InstanceArt
                    name={instance.version.name}
                    image={instance.version.image}
                    className="size-6 rounded-md"
                    textClassName="font-mono text-[0.6rem]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.8rem] text-foreground">
                    {instance.version.name}
                  </span>
                  <Hint
                    content={isPinned ? t("layout.unpin") : t("layout.pin")}
                    side="right"
                  >
                    <button
                      type="button"
                      aria-pressed={isPinned}
                      aria-label={isPinned ? t("layout.unpin") : t("layout.pin")}
                      onClick={() => pinInDock(key, !isPinned)}
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        isPinned ? "text-foreground" : "text-faint hover:text-foreground",
                      )}
                    >
                      <Pin className="size-3.5" />
                    </button>
                  </Hint>
                  <SlotToggle
                    hidden={isHiddenHere}
                    label={instance.version.name}
                    onToggle={() => hideFromDock(key, !isHiddenHere)}
                  />
                </div>
              );
            }

            return (
              <ContextMenu key={key}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    aria-current={isActive}
                    aria-label={collapsed ? instance.version.name : undefined}
                    data-indicator-active={isActive}
                    onClick={() => navigate({ name: "instance", id: key })}
                    className={cn(
                      "relative flex h-10 w-full items-center rounded-lg text-left transition-colors not-aria-[current=true]:hover:bg-sidebar-accent",
                      collapsed ? "justify-center" : "gap-2.5 px-2.5",
                    )}
                  >
                    {collapsed ? (
                      <Hint content={instance.version.name} side="right">
                        <span className="relative">
                          <InstanceArt
                            name={instance.version.name}
                            image={instance.version.image}
                            className="size-7 rounded-md"
                            textClassName="font-mono text-[0.6rem]"
                          />
                          {running.has(instance.version.name) && (
                            <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-success ring-2 ring-sidebar" />
                          )}
                        </span>
                      </Hint>
                    ) : (
                      <InstanceArt
                        name={instance.version.name}
                        image={instance.version.image}
                        className="size-6 rounded-md"
                        textClassName="font-mono text-[0.6rem]"
                      />
                    )}

                    {!collapsed && (
                      <span className="grid min-w-0 flex-1">
                        <Hint
                          content={instance.version.name}
                          variant="text"
                          side="right"
                          truncatedOnly
                        >
                          <span className="truncate text-[0.8rem] leading-4 text-foreground">
                            {instance.version.name}
                          </span>
                        </Hint>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${loader.dot}`}
                          />
                          <span className="truncate font-mono text-[0.65rem] leading-4 text-faint">
                            {instance.version.version.id}
                          </span>
                        </span>
                      </span>
                    )}

                    {!collapsed && isPinned && (
                      <Pin className="size-3 shrink-0 text-faint" />
                    )}

                    {!collapsed && running.has(instance.version.name) && (
                      <span className="size-1.5 shrink-0 rounded-full bg-success" />
                    )}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  {actionsFor(instance, key).map((group, index) => (
                    <div key={group[0]?.id ?? index}>
                      {index > 0 && <ContextMenuSeparator />}
                      {group.map((action) => (
                        <ContextMenuItem
                          key={action.id}
                          variant={
                            action.destructive ? "destructive" : "default"
                          }
                          disabled={action.disabled}
                          onSelect={action.onSelect}
                        >
                          <action.icon />
                          <span>{action.label}</span>
                        </ContextMenuItem>
                      ))}
                    </div>
                  ))}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          {!editing && missing > 0 && (
            <Hint
              content={t("layout.dockMoreHint")}
              side="right"
            >
              <button
                type="button"
                onClick={() => navigate({ name: "home" })}
                aria-label={t("layout.dockMore", { count: missing })}
                className={cn(
                  "flex h-7 w-full items-center gap-1.5 rounded-lg text-[0.7rem] text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  collapsed ? "justify-center" : "px-2.5",
                )}
              >
                {collapsed ? (
                  <span className="font-mono tabular-nums">+{missing}</span>
                ) : (
                  <>
                    <span>{t("layout.dockMore", { count: missing })}</span>
                    <ChevronRight className="size-3" />
                  </>
                )}
              </button>
            </Hint>
          )}
        </div>
      )}
    </div>
  );
}
