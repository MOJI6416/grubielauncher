import { ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue } from "jotai";
import {
  BookUser,
  Newspaper,
  Play,
  Settings as LSettings,
  UserRound,
} from "lucide-react";
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
import { OWN_PROFILE_ID } from "@renderer/features/profile/loadProfileUser";
import { LazySettingsScreen } from "@renderer/screens/lazyScreens";
import { InstanceDock } from "./InstanceDock";
import { NowBlock } from "./NowBlock";
import { VoicePanel } from "./VoicePanel";

const loadLanShareModal = () =>
  import("@renderer/features/share/SharePanel").then((module) => ({
    default: module.LanShareModal,
  }));

const LazyLanShareModal = lazyWithPreload(loadLanShareModal);

const NAV_CLASS =
  "flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground aria-[current=true]:bg-primary-soft aria-[current=true]:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-50";

function NavRow({
  icon,
  label,
  current,
  disabled,
  hint,
  badge,
  onSelect,
  onPreload,
}: {
  icon: ReactNode;
  label: string;
  current: boolean;
  disabled?: boolean;
  hint?: string;
  badge?: ReactNode;
  onSelect: () => void;
  onPreload?: () => void;
}) {
  return (
    <Hint content={disabled ? hint : undefined} side="right">
      <button
        type="button"
        aria-current={current}
        aria-disabled={disabled}
        onMouseEnter={onPreload}
        onFocus={onPreload}
        onClick={() => {
          if (disabled) return;
          onSelect();
        }}
        className={NAV_CLASS}
      >
        <span className="shrink-0 text-faint">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {badge}
      </button>
    </Hint>
  );
}

function isRoute(route: Route, name: Route["name"]): boolean {
  return route.name === name;
}

export function Sidebar() {
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
  const { t } = useTranslation();

  const connectivity = useMemo(
    () => ({ isInternetOnline, isBackendOnline }),
    [isBackendOnline, isInternetOnline],
  );
  const canUseBackend = canUseBackendFeature(connectivity);
  const isFriendsDisabled =
    !selectedAccount || selectedAccount.type === "plain";
  const isProfileDisabled = isFriendsDisabled;
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

  useEffect(() => {
    return schedulePreload([LazySettingsScreen.preload], 2500);
  }, []);

  useEffect(() => {
    if (!shouldShowShareButton) return;
    return schedulePreload([LazyLanShareModal.preload], 400);
  }, [shouldShowShareButton]);

  return (
    <>
      <aside className="flex w-62 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex min-h-0 flex-1 flex-col p-2.5">
          <div className="flex shrink-0 flex-col gap-0.5">
            <NavRow
              icon={<Play className="size-4" />}
              label={t("nav.play")}
              current={isRoute(route, "home")}
              onSelect={() => navigate({ name: "home" })}
            />

            <NavRow
              icon={<BookUser className="size-4" />}
              label={t("shell.nav.people")}
              current={isRoute(route, "people")}
              disabled={isFriendsDisabled}
              hint={friendsHint}
              badge={
                playingFriends > 0 ? (
                  <span className="shrink-0 rounded-md bg-success/15 px-1.5 font-mono text-[0.65rem] tabular-nums text-success">
                    {playingFriends}
                  </span>
                ) : undefined
              }
              onSelect={() => navigate({ name: "people" })}
            />

            <NavRow
              icon={<UserRound className="size-4" />}
              label={t("shell.nav.profile")}
              current={isRoute(route, "profile")}
              disabled={isProfileDisabled}
              hint={
                selectedAccount
                  ? t("shell.nav.profileOffline")
                  : t("accounts.signIn")
              }
              onSelect={() =>
                navigate({ name: "profile", userId: OWN_PROFILE_ID })
              }
            />

            <NavRow
              icon={<Newspaper className="size-4" />}
              label={t("news.title")}
              current={isRoute(route, "news")}
              onSelect={() => navigate({ name: "news" })}
            />

            <NavRow
              icon={<LSettings className="size-4" />}
              label={t("settings.title")}
              current={isRoute(route, "settings")}
              disabled={isRunning}
              hint={t("versions.running")}
              onPreload={() => preload(LazySettingsScreen.preload)}
              onSelect={() => navigate({ name: "settings" })}
            />
          </div>

          <InstanceDock />

          <NowBlock onOpenErrors={() => setIsErrorLogOpen(true)} />
        </div>

        <div className="flex shrink-0 flex-col border-t border-border p-2">
          <VoicePanel />
          <AccountSwitcher />
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
