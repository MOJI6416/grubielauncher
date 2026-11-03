import {
  DragEvent,
  ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue } from "jotai";
import {
  BookUser,
  EyeOff,
  GripVertical,
  LayoutTemplate,
  Lock,
  Newspaper,
  Play,
  Settings as LSettings,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  accountAtom,
  friendsAtom,
  internetAtom,
  isFriendsConnectedAtom,
  isRunningAtom,
  isShareModalOpenAtom,
  networkAtom,
  shareOwnerAccountKeyAtom,
  shareStateAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import { AccountSwitcher } from "@renderer/features/accounts/AccountSwitcher";
import { ErrorLog } from "@renderer/components/ErrorLog";
import { Hint } from "@renderer/components/Hint";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  lazyWithPreload,
  preload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import { canUseBackendFeature } from "@renderer/utilities/connectivity";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";
import { currentRouteAtom } from "@renderer/navigation/store";
import { navigate } from "@renderer/navigation/navigate";
import { Route } from "@renderer/navigation/routes";
import {
  LazyAgentScreen,
  LazyInstanceScreen,
  LazySettingsScreen,
} from "@renderer/screens/lazyScreens";
import { preloadProfileScreen } from "@renderer/screens/profile/ProfileScreen";
import { InstanceDock } from "./InstanceDock";
import type { RunGameParams } from "@renderer/features/launch/types";
import { NowBlock } from "./NowBlock";
import { VoicePanel } from "./VoicePanel";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";
import { SeasonalSidebarWeb } from "@renderer/features/seasonal/SeasonalDecor";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "./sidebarCollapse";
import {
  isNavFixed,
  isSlotHidden,
  orderedNav,
  placeNav,
  slotId,
  visibleNav,
  type NavSlot,
} from "@renderer/features/layout/layout";
import {
  startLayoutEditing,
  toggleSlot,
  updateLayout,
  useLayout,
  useLayoutEditing,
} from "@renderer/features/layout/useLayout";
import { SlotToggle } from "@renderer/features/layout/SlotToggle";

const loadLanShareModal = () =>
  import("@renderer/features/share/SharePanel").then((module) => ({
    default: module.LanShareModal,
  }));

const LazyLanShareModal = lazyWithPreload(loadLanShareModal);

const NAV_CLASS =
  "relative flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground not-aria-[current=true]:hover:bg-sidebar-accent aria-[current=true]:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-50";

type NavConfig = {
  icon: ReactNode;
  label: string;
  current: boolean;
  disabled?: boolean;
  hint?: string;
  badge?: ReactNode;
  onSelect: () => void;
  onPreload?: () => void;
};

function NavRow({
  slot,
  config,
  dragProps,
}: {
  slot: NavSlot;
  config: NavConfig;
  dragProps: (slot: NavSlot) => Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const collapsed = useSidebarCollapsed();
  const editing = useLayoutEditing();
  const layout = useLayout();
  const fixed = isNavFixed(slot);
  const hidden = !fixed && isSlotHidden(layout, slotId.nav(slot));
  const { icon, label, current, disabled, hint, badge, onSelect, onPreload } =
    config;
  const tooltip = collapsed
    ? disabled && hint
      ? `${label} — ${hint}`
      : label
    : disabled
      ? hint
      : undefined;

  if (editing) {
    return (
      <div
        className={cn(
          NAV_CLASS,
          "cursor-grab pr-1 active:cursor-grabbing",
          hidden && "opacity-45",
        )}
        {...dragProps(slot)}
      >
        <GripVertical className="-ml-1 size-3.5 shrink-0 text-faint" />
        <span className="relative shrink-0 text-faint">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {fixed ? (
          <Hint content={t("layout.alwaysVisible")} side="right">
            <span className="flex size-6 shrink-0 items-center justify-center text-faint">
              <Lock className="size-3" />
            </span>
          </Hint>
        ) : (
          <SlotToggle
            hidden={hidden}
            label={label}
            onToggle={() => toggleSlot(slotId.nav(slot), !hidden)}
          />
        )}
      </div>
    );
  }

  const row = (
    <button
      type="button"
      aria-current={current}
      aria-disabled={disabled}
      data-indicator-active={current}
      onMouseEnter={onPreload}
      onFocus={onPreload}
      onClick={() => {
        if (disabled) return;
        onSelect();
      }}
      aria-label={collapsed ? label : undefined}
      className={cn(NAV_CLASS, collapsed && "justify-center px-0")}
    >
      <span className="relative shrink-0 text-faint">
        {icon}
        {collapsed && badge && (
          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-success" />
        )}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      )}
      {!collapsed && badge}
    </button>
  );


  return (
    <ContextMenu>
      <Hint content={tooltip} side="right">
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      </Hint>
      <ContextMenuContent className="w-56">
        {!fixed && (
          <ContextMenuItem onSelect={() => toggleSlot(slotId.nav(slot), true)}>
            <EyeOff />
            <span>{t("layout.hideFromSidebar")}</span>
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={startLayoutEditing}>
          <LayoutTemplate />
          <span>{t("layout.customize")}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function isRoute(route: Route, name: Route["name"]): boolean {
  return route.name === name;
}

export function Sidebar({
  runGame,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const selectedAccount = useAtomValue(accountAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const isRunning = useAtomValue(isRunningAtom);
  const friends = useAtomValue(friendsAtom);
  const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useAtom(isShareModalOpenAtom);
  const isFriendsConnected = useAtomValue(isFriendsConnectedAtom);
  const shareState = useAtomValue(shareStateAtom);
  const shareOwnerAccountKey = useAtomValue(shareOwnerAccountKeyAtom);
  const route = useAtomValue(currentRouteAtom);
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const { t } = useTranslation();
  const navIndicator = useSlidingIndicator<HTMLDivElement>();
  const collapsed = useSidebarCollapsed();
  const layout = useLayout();
  const editing = useLayoutEditing();
  const isDockVisible = !isSlotHidden(layout, slotId.section("dock"));
  const isNowVisible = !isSlotHidden(layout, slotId.section("now"));
  const navSlots = editing ? orderedNav(layout) : visibleNav(layout);
  const draggedNav = useRef<NavSlot | null>(null);

  const connectivity = useMemo(
    () => ({ isInternetOnline, isBackendOnline }),
    [isBackendOnline, isInternetOnline],
  );
  const canUseBackend = canUseBackendFeature(connectivity);
  const isFriendsDisabled =
    !selectedAccount || selectedAccount.type === "plain";
  const friendsHint = !canUseBackend
    ? t("app.backendUnavailable")
    : isFriendsConnected
      ? undefined
      : t("friends.unavailableHint");

  const playingFriends = useMemo(
    () =>
      friends.filter((friend) => friend.isOnline && Boolean(friend.versionName))
        .length,
    [friends],
  );

  const shouldShowShareButton = useMemo(() => {
    return (
      !["idle", "lan_not_found"].includes(shareState.phase) &&
      canCurrentAccountManageShare(shareOwnerAccountKey, selectedAccount)
    );
  }, [selectedAccount, shareOwnerAccountKey, shareState.phase]);

  useEffect(() => {
    if (!shouldShowShareButton) setIsShareOpen(false);
  }, [shouldShowShareButton]);

  const navDragProps = (slot: NavSlot) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      draggedNav.current = slot;
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", slot);
      } catch {}
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!draggedNav.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const dragged = draggedNav.current;
      draggedNav.current = null;
      if (!dragged || dragged === slot) return;
      event.preventDefault();
      updateLayout((current) => placeNav(current, dragged, slot));
    },
    onDragEnd: () => {
      draggedNav.current = null;
    },
  });

  const navConfigs: Record<NavSlot, NavConfig> = {
    play: {
      icon: <Play className="size-4" />,
      label: t("nav.play"),
      current: isRoute(route, "home"),
      onSelect: () => navigate({ name: "home" }),
    },
    people: {
      icon: <BookUser className="size-4" />,
      label: t("shell.nav.people"),
      current: isRoute(route, "people"),
      disabled: isFriendsDisabled,
      hint: friendsHint,
      badge:
        playingFriends > 0 ? (
          <span className="shrink-0 rounded-md bg-success/15 px-1.5 font-mono text-[0.65rem] tabular-nums text-success">
            {playingFriends}
          </span>
        ) : undefined,
      onSelect: () => navigate({ name: "people" }),
    },
    news: {
      icon: <Newspaper className="size-4" />,
      label: t("news.title"),
      current: isRoute(route, "news"),
      onSelect: () => navigate({ name: "news" }),
    },
    settings: {
      icon: <LSettings className="size-4" />,
      label: t("settings.title"),
      current: isRoute(route, "settings"),
      disabled: isRunning,
      hint: t("versions.running"),
      onPreload: () => preload(LazySettingsScreen.preload),
      onSelect: () => navigate({ name: "settings" }),
    },
  };

  useEffect(() => {
    if (!versionsLoaded) return;
    return schedulePreload(
      [
        LazySettingsScreen.preload,
        LazyInstanceScreen.preload,
        LazyAgentScreen.preload,
        preloadProfileScreen,
      ],
      2500,
    );
  }, [versionsLoaded]);

  useEffect(() => {
    if (!shouldShowShareButton) return;
    return schedulePreload([LazyLanShareModal.preload], 400);
  }, [shouldShowShareButton]);

  return (
    <>
      <aside
        className={cn(
          "relative isolate flex shrink-0 flex-col border-r border-border bg-sidebar",
          collapsed ? "w-16" : "w-62",
        )}
      >
        <SeasonalSidebarWeb />
        <div className="flex min-h-0 flex-1 flex-col p-2.5">
          <div
            ref={navIndicator.containerRef}
            className="relative flex shrink-0 flex-col gap-0.5"
          >
            <SlidingIndicator
              indicator={navIndicator}
              variant="fill"
              className="rounded-lg bg-primary-soft"
            />
            {navSlots.map((slot) => (
              <NavRow
                key={slot}
                slot={slot}
                config={navConfigs[slot]}
                dragProps={navDragProps}
              />
            ))}
          </div>

          {(editing || isDockVisible) && <InstanceDock runGame={runGame} />}

          {(editing || isNowVisible) && (
            <NowBlock onOpenErrors={() => setIsErrorLogOpen(true)} />
          )}
        </div>

        <div className="flex shrink-0 flex-col border-t border-border p-2">
          <VoicePanel />
          <AccountSwitcher collapsed={collapsed} />
        </div>
      </aside>

      {isShareOpen && (
        <Suspense fallback={<LazyDialogFallback variant="compact" />}>
          <LazyLanShareModal
            isOpen={isShareOpen}
            onClose={() => setIsShareOpen(false)}
          />
        </Suspense>
      )}
      {isErrorLogOpen && <ErrorLog onClose={() => setIsErrorLogOpen(false)} />}
    </>
  );
}
