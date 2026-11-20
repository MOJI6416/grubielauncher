import {
  ReactNode,
  Suspense,
  useEffect,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue } from "jotai";
import {
  BookUser,
  EyeOff,
  Gamepad2,
  LayoutTemplate,
  Lock,
  Camera,
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
  friendRequestsAtom,
  friendsAtom,
  groupInvitesAtom,
  groupUnreadsAtom,
  internetAtom,
  isFriendsConnectedAtom,
  isShareModalOpenAtom,
  mutedGroupsAtom,
  networkAtom,
  shareOwnerAccountKeyAtom,
  shareStateAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import { AccountSwitcher } from "@renderer/features/accounts/AccountSwitcher";
import { friendUnreadAtom } from "@renderer/features/friends/unreadStore";
import {
  formatBadge,
  peopleBadgeCount,
} from "@renderer/features/friends/peopleHub";
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
import {
  routeBlockReason,
  routeBlockedKey,
} from "@renderer/navigation/access";
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
import { useZoneStyle } from "@renderer/features/theme/zoneStyle";
import {
  isNavFixed,
  isSlotHidden,
  orderedNav,
  slotId,
  visibleNav,
  type NavSlot,
} from "@renderer/features/layout/layout";
import {
  setSlotVisible,
  startLayoutEditing,
  useLayout,
  useLayoutEditing,
} from "@renderer/features/layout/useLayout";
import { SlotToggle } from "@renderer/features/layout/SlotToggle";
import { ReorderHandle, useNavDrag } from "@renderer/features/layout/ReorderHandle";

const loadLanShareModal = () =>
  import("@renderer/features/share/SharePanel").then((module) => ({
    default: module.LanShareModal,
  }));

const LazyLanShareModal = lazyWithPreload(loadLanShareModal);

const NAV_CLASS =
  "relative flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground not-aria-[current=page]:hover:bg-row-hover aria-[current=page]:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-50";

type NavConfig = {
  icon: ReactNode;
  label: string;
  current: boolean;
  disabled?: boolean;
  hint?: string;
  badge?: ReactNode;
  badgeNote?: string;
  badgeDot?: "info" | "success";
  onSelect: () => void;
  onPreload?: () => void;
};

function NavRow({
  slot,
  config,
  index,
  count,
  dragProps,
}: {
  slot: NavSlot;
  config: NavConfig;
  index: number;
  count: number;
  dragProps: ReturnType<typeof useNavDrag>;
}) {
  const { t } = useTranslation();
  const collapsed = useSidebarCollapsed();
  const editing = useLayoutEditing();
  const layout = useLayout();
  const fixed = isNavFixed(slot);
  const hidden = !fixed && isSlotHidden(layout, slotId.nav(slot));
  const {
    icon,
    label,
    current,
    disabled,
    hint,
    badge,
    badgeNote,
    badgeDot,
    onSelect,
    onPreload,
  } = config;
  const tooltip = collapsed
    ? disabled && hint
      ? `${label} — ${hint}`
      : badgeNote
        ? `${label} · ${badgeNote}`
        : label
    : disabled
      ? hint
      : undefined;

  if (editing) {
    return (
      <div
        className={cn(
          NAV_CLASS,
          "pr-1 pl-0.5 data-[drop-target]:bg-row-selected",
          hidden && "opacity-45",
        )}
        {...dragProps(slot)}
      >
        <ReorderHandle slot={slot} label={label} index={index} count={count} />
        <span className="relative shrink-0 text-faint">{icon}</span>
        <Hint content={label} variant="text" side="right" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        </Hint>
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
            onToggle={() => setSlotVisible(slotId.nav(slot), label, hidden)}
          />
        )}
      </div>
    );
  }

  const hide = () => setSlotVisible(slotId.nav(slot), label, false);

  const row = (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
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
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 size-1.5 rounded-full",
              badgeDot === "info" ? "bg-info" : "bg-success",
            )}
          />
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
      <Hint
        content={tooltip ?? label}
        side="right"
        truncatedOnly={tooltip === undefined}
      >
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      </Hint>
      <ContextMenuContent className="w-56">
        {!fixed && (
          <ContextMenuItem onSelect={hide}>
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
  const friends = useAtomValue(friendsAtom);
  const friendUnread = useAtomValue(friendUnreadAtom);
  const friendRequests = useAtomValue(friendRequestsAtom);
  const groupInvites = useAtomValue(groupInvitesAtom);
  const groupUnreads = useAtomValue(groupUnreadsAtom);
  const mutedGroups = useAtomValue(mutedGroupsAtom);
  const [isShareOpen, setIsShareOpen] = useAtom(isShareModalOpenAtom);
  const isFriendsConnected = useAtomValue(isFriendsConnectedAtom);
  const shareState = useAtomValue(shareStateAtom);
  const shareOwnerAccountKey = useAtomValue(shareOwnerAccountKeyAtom);
  const route = useAtomValue(currentRouteAtom);
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const zoneStyle = useZoneStyle("sidebar");
  const { t } = useTranslation();
  const navIndicator = useSlidingIndicator<HTMLDivElement>();
  const collapsed = useSidebarCollapsed();
  const layout = useLayout();
  const editing = useLayoutEditing();
  const isDockVisible = !isSlotHidden(layout, slotId.section("dock"));
  const isNowVisible = !isSlotHidden(layout, slotId.section("now"));
  const navSlots = editing ? orderedNav(layout) : visibleNav(layout);
  const navDragProps = useNavDrag();

  const connectivity = useMemo(
    () => ({ isInternetOnline, isBackendOnline }),
    [isBackendOnline, isInternetOnline],
  );
  const canUseBackend = canUseBackendFeature(connectivity);
  const peopleBlocked = routeBlockReason(
    { name: "people" },
    { accountType: selectedAccount?.type ?? null },
  );
  const isFriendsDisabled = peopleBlocked !== null;
  const friendsHint = peopleBlocked
    ? t(routeBlockedKey(peopleBlocked))
    : !canUseBackend
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

  const peopleNews = useMemo(
    () =>
      peopleBadgeCount({
        unread: friendUnread,
        groupUnreads,
        mutedGroups,
        incomingRequests: friendRequests.filter(
          (request) => request.type === "recipient",
        ).length,
        groupInvites: groupInvites.length,
      }),
    [friendRequests, friendUnread, groupInvites, groupUnreads, mutedGroups],
  );

  const peopleNotes = [
    peopleNews > 0 ? t("shell.nav.peopleNews", { value: formatBadge(peopleNews) }) : "",
    playingFriends > 0
      ? t("shell.nav.peoplePlaying", { value: playingFriends })
      : "",
  ].filter(Boolean);

  const shouldShowShareButton = useMemo(() => {
    return (
      !["idle", "lan_not_found"].includes(shareState.phase) &&
      canCurrentAccountManageShare(shareOwnerAccountKey, selectedAccount)
    );
  }, [selectedAccount, shareOwnerAccountKey, shareState.phase]);

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
        peopleNews > 0 || playingFriends > 0 ? (
          <span className="flex shrink-0 items-center gap-1">
            {playingFriends > 0 && (
              <Hint
                content={t("shell.nav.peoplePlaying", { value: playingFriends })}
                side="right"
              >
                <span className="flex items-center gap-0.5 font-mono text-3xs tabular-nums text-success">
                  <Gamepad2 className="size-3" />
                  {playingFriends}
                </span>
              </Hint>
            )}
            {peopleNews > 0 && (
              <Hint
                content={t("shell.nav.peopleNews", {
                  value: formatBadge(peopleNews),
                })}
                side="right"
              >
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-info/15 px-1 font-mono text-3xs leading-none tabular-nums text-info">
                  {formatBadge(peopleNews)}
                </span>
              </Hint>
            )}
          </span>
        ) : undefined,
      badgeNote: peopleNotes.length > 0 ? peopleNotes.join(" · ") : undefined,
      badgeDot: peopleNews > 0 ? "info" : "success",
      onSelect: () => navigate({ name: "people" }),
    },
    screenshots: {
      icon: <Camera className="size-4" />,
      label: t("versions.screenshots.title"),
      current: isRoute(route, "screenshots"),
      onSelect: () => navigate({ name: "screenshots" }),
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
          "relative isolate flex shrink-0 flex-col border-r border-border bg-sidebar text-foreground",
          collapsed ? "w-16" : "w-62",
        )}
        style={zoneStyle}
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
              className="rounded-lg bg-row-selected"
            />
            {navSlots.map((slot, index) => (
              <NavRow
                key={slot}
                slot={slot}
                config={navConfigs[slot]}
                index={index}
                count={navSlots.length}
                dragProps={navDragProps}
              />
            ))}
          </div>

          {(editing || isDockVisible) && <InstanceDock runGame={runGame} />}

          {(editing || isNowVisible) && (
            <NowBlock />
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
    </>
  );
}
