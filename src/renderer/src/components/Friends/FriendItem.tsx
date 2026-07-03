import { useMemo } from "react";
import { ILocalFriend } from "@/types/ILocalFriend";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarClock,
  Earth,
  Gamepad2,
  Headphones,
  Mail,
  Mailbox,
  Play,
  Send,
  Shirt,
  Sparkles,
  User,
  UserMinus,
  Volume,
  VolumeX,
} from "lucide-react";
import { getPlatformIcon } from "./Friends";
import { IFriend } from "@/types/IFriend";
import { formatDate } from "@renderer/utilities/date";
import {
  levelFromPoints,
  pointsForAchievements,
} from "@renderer/utilities/achievements";
import { ActiveFriendShare } from "@/types/Share";

interface FriendItemProps {
  friend: IFriend;
  activeShare?: ActiveFriendShare;
  isNotRead: boolean;
  local?: ILocalFriend;
  isRunning: boolean;
  onSelect: () => void;
  onJoin: () => void;
  onInvite: () => void;
  onInviteToVoice?: () => void;
  onViewAccount: () => void;
  onOpenChat: () => void;
  onViewSkin: () => void;
  isViewSkinDisabled?: boolean;
  onToggleMute: () => void;
  onRemove: () => void;
  t: any;
}

export function FriendItem({
  friend,
  activeShare,
  isNotRead,
  local,
  isRunning,
  onSelect,
  onJoin,
  onInvite,
  onInviteToVoice,
  onViewAccount,
  onOpenChat,
  onViewSkin,
  isViewSkinDisabled = false,
  onToggleMute,
  onRemove,
  t,
}: FriendItemProps) {
  const level = levelFromPoints(
    pointsForAchievements(friend.user.achievements ?? []),
  );
  const hasJoinTarget =
    (!!friend.versionCode || !!activeShare?.versionShareCode) &&
    (!!friend.serverAddress || !!activeShare);
  const canJoin = friend.isOnline && hasJoinTarget && !isRunning;
  const disabledKeys = useMemo(() => {
    const keys = ["last"] as string[];
    if (!canJoin) keys.push("join");
    if (!friend.isOnline) keys.push("invite");
    return keys;
  }, [canJoin, friend.isOnline]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex w-full min-w-0 items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-card-foreground shadow-xs transition-all outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
          onClick={onSelect}
        >
          <Avatar className="h-8 w-8" size="sm">
            <AvatarImage
              src={friend.user.image || ""}
              alt={friend.user.nickname}
            />
            <AvatarFallback>
              {friend.user.nickname.slice(0, 2).toUpperCase()}
            </AvatarFallback>
            <AvatarBadge
              aria-label={
                friend.isOnline ? t("friends.online") : t("friends.offline")
              }
              title={
                friend.isOnline ? t("friends.online") : t("friends.offline")
              }
              className={
                friend.isOnline ? "bg-emerald-500" : "bg-muted-foreground"
              }
            />
          </Avatar>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="min-w-0 truncate text-sm font-medium">
                {friend.user.nickname}
              </p>
              <span className="shrink-0 text-muted-foreground">
                {getPlatformIcon(friend.user.platform)}
              </span>
              {level >= 2 && (
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 rounded border border-primary/30 bg-primary/10 px-1 text-[10px] font-medium leading-4 text-primary"
                  title={`${t("achievements.level")} ${level}`}
                >
                  <Sparkles className="size-2.5" />
                  {level}
                </span>
              )}
            </div>

            {friend.isOnline && friend.versionName && (
              <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <Gamepad2 size={14} className="shrink-0" />
                <p className="min-w-0 truncate text-xs">{friend.versionName}</p>
              </div>
            )}

            {(friend.serverAddress || activeShare) && (
              <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <Earth size={14} className="shrink-0" />
                <p className="min-w-0 truncate text-xs">
                  {friend.serverAddress ||
                    (activeShare?.publicAddress.includes(
                      "join.grubielauncher.com",
                    )
                      ? "Shared World"
                      : activeShare?.publicAddress)}
                </p>
              </div>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {canJoin && (
              <span
                role="button"
                tabIndex={0}
                aria-label={t("friends.join")}
                title={t("friends.join")}
                className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onJoin();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.stopPropagation();
                  event.preventDefault();
                  onJoin();
                }}
              >
                <Play size={13} />
                {t("friends.joinFlow.playAction")}
              </span>
            )}
            {!canJoin && friend.isOnline && isRunning && (
              <span
                role="button"
                tabIndex={0}
                aria-label={t("friends.invite")}
                title={t("friends.invite")}
                className="flex h-7 items-center gap-1.5 rounded-md border bg-background/70 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onInvite();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.stopPropagation();
                  event.preventDefault();
                  onInvite();
                }}
              >
                <Send size={13} />
                {t("friends.invite")}
              </span>
            )}
            {local?.isMuted && (
              <Badge
                variant="outline"
                className="h-6 min-w-6 justify-center px-1.5 text-muted-foreground"
                aria-label={t("friends.notificationDisabled")}
                title={t("friends.notificationDisabled")}
              >
                <VolumeX size={13} />
              </Badge>
            )}
            {isNotRead && (
              <Badge
                variant="outline"
                className="h-6 min-w-6 justify-center px-1.5 text-muted-foreground"
                aria-label={t("friends.newMessage")}
                title={t("friends.newMessage")}
              >
                <Mailbox size={13} />
              </Badge>
            )}
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        {!friend.isOnline ? (
          <DropdownMenuItem disabled={disabledKeys.includes("last")}>
            <CalendarClock size={18} />
            {formatDate(new Date(friend.user.lastActive))}
          </DropdownMenuItem>
        ) : null}

        {!friend.isOnline ? <DropdownMenuSeparator /> : null}

        {hasJoinTarget ? (
          <DropdownMenuItem
            disabled={disabledKeys.includes("join")}
            onSelect={onJoin}
          >
            <Gamepad2 size={18} />
            {t("friends.join")}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem
          disabled={disabledKeys.includes("invite")}
          onSelect={onInvite}
        >
          <Send size={18} />
          {t("friends.invite")}
        </DropdownMenuItem>

        {onInviteToVoice && (
          <DropdownMenuItem
            disabled={!friend.isOnline}
            onSelect={onInviteToVoice}
          >
            <Headphones size={18} />
            {t("groups.inviteToVoice")}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onSelect={onViewAccount}>
          <User size={18} />
          {t("accountInfo.viewAccount")}
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onOpenChat}>
          <Mail size={18} />
          {t("friends.chat")}
        </DropdownMenuItem>

        <DropdownMenuItem disabled={isViewSkinDisabled} onSelect={onViewSkin}>
          <Shirt size={18} />
          {t("skinView.title")}
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onToggleMute}>
          {local?.isMuted ? <Volume size={18} /> : <VolumeX size={18} />}
          {local?.isMuted
            ? t("friends.enableNotifications")
            : t("friends.disableNotifications")}
        </DropdownMenuItem>

        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <UserMinus size={18} />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
