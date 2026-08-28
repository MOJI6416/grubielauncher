import { memo } from "react";
import type { TFunction } from "i18next";
import {
  CalendarClock,
  Copy,
  Gamepad2,
  Headphones,
  PhoneCall,
  Play,
  Send,
  Shirt,
  User,
  UserMinus,
  Volume,
  VolumeX,
} from "lucide-react";
import { HeadDot, PlayerHead } from "@renderer/features/accounts/AccountHead";
import { Hint } from "@renderer/components/Hint";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { formatDate, formatRelative } from "@renderer/utilities/date";
import { describePreview } from "./chatSummary";
import { friendRowDetail, type FriendEntry } from "./friendsList";
import { canJoinFriend, presenceDotColor } from "./presence";
import { isDmRoomWith } from "./voiceRoom";
import { PlatformIcon } from "./PlatformIcon";

export interface FriendRowActions {
  onOpenChat: (friendId: string) => void;
  onJoin: (friendId: string) => void;
  onInvite: (friendId: string) => void;
  onStartCall: (friendId: string) => void;
  onInviteToVoice?: (friendId: string) => void;
  onViewProfile: (friendId: string) => void;
  onViewSkin: (friendId: string) => void;
  onToggleMute: (friendId: string) => void;
  onCopyNickname: (friendId: string) => void;
  onRemove: (friendId: string) => void;
}

interface FriendRowProps extends FriendRowActions {
  entry: FriendEntry;
  isActive: boolean;
  isGameRunning: boolean;
  isCallBusy: boolean;
  ownUserId?: string;
  voiceRoomId?: string;
  t: TFunction;
}

export function describePresence(entry: FriendEntry, t: TFunction) {
  const { presence } = entry;

  if (presence.kind === "offline") {
    const value = presence.lastActiveAt
      ? formatRelative(new Date(presence.lastActiveAt))
      : "";
    return value ? t("friends.lastSeen", { value }) : t("friends.offline");
  }

  const place =
    presence.place?.kind === "server"
      ? presence.place.address
      : presence.place?.kind === "sharedWorld"
        ? t("friends.sharedWorld")
        : presence.place?.kind === "world"
          ? presence.place.address
          : "";

  const parts = [presence.versionName, place].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : t("friends.online");
}

export function describeRowDetail(
  entry: FriendEntry,
  ownUserId: string | undefined,
  t: TFunction,
): string {
  const detail = friendRowDetail(entry);
  if (detail === "typing") return t("friends.chatTyping");

  if (detail === "preview") {
    const preview = describePreview(entry.preview, ownUserId);
    if (preview) {
      const body = preview.labelKey ? t(preview.labelKey) : preview.text;
      return preview.isOwn ? `${t("friends.you")}: ${body}` : body;
    }
  }

  return describePresence(entry, t);
}

function FriendRowComponent({
  entry,
  isActive,
  isGameRunning,
  isCallBusy,
  ownUserId,
  voiceRoomId,
  t,
  onOpenChat,
  onJoin,
  onInvite,
  onStartCall,
  onInviteToVoice,
  onViewProfile,
  onViewSkin,
  onToggleMute,
  onCopyNickname,
  onRemove,
}: FriendRowProps) {
  const { friend, presence, unread, isMuted } = entry;
  const id = friend.user._id;
  const canJoin = canJoinFriend(presence, isGameRunning);
  const canInvite = friend.isOnline && isGameRunning;
  const detailKind = friendRowDetail(entry);
  const detail = describeRowDetail(entry, ownUserId, t);
  const canViewSkin = !(
    friend.user.platform === "microsoft" && !friend.user.uuid
  );
  const isCallDisabled = isCallBusy || isDmRoomWith(voiceRoomId, ownUserId, id);
  const lastSeen = presence.lastActiveAt
    ? formatDate(new Date(presence.lastActiveAt))
    : "";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group flex h-12 w-full min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 transition-colors",
            isActive ? "border-primary/40 bg-surface-3" : "hover:bg-surface-3",
            "has-[[data-state=open]]:bg-surface-3",
          )}
        >
          <button
            type="button"
            aria-current={isActive ? "true" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenChat(id)}
          >
            <PlayerHead
              user={friend.user}
              size={32}
              badge={
                <HeadDot
                  label={
                    presence.kind === "offline"
                      ? t("friends.offline")
                      : presence.kind === "playing"
                        ? t("friends.playing")
                        : t("friends.online")
                  }
                  className={presenceDotColor(presence.kind)}
                />
              }
            />

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <Hint
                  content={friend.user.nickname}
                  variant="text"
                  truncatedOnly
                >
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm",
                      unread > 0 ? "font-semibold" : "font-medium",
                    )}
                  >
                    {friend.user.nickname}
                  </span>
                </Hint>
                <span className="shrink-0 text-faint">
                  <PlatformIcon platform={friend.user.platform} />
                </span>
                {isMuted && (
                  <VolumeX
                    size={11}
                    className="shrink-0 text-faint"
                    aria-label={t("friends.notificationDisabled")}
                  />
                )}
              </span>

              <Hint content={detail} variant="text" truncatedOnly>
                <span
                  className={cn(
                    "min-w-0 truncate text-[11px] leading-4",
                    detailKind === "typing"
                      ? "text-foreground"
                      : detailKind === "preview" && unread > 0
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {detail}
                </span>
              </Hint>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            {canJoin && (
              <Hint content={t("friends.join")}>
                <button
                  type="button"
                  aria-label={t("friends.join")}
                  className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-3 text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onJoin(id)}
                >
                  <Play size={13} />
                </button>
              </Hint>
            )}
            {!canJoin && canInvite && (
              <Hint content={t("friends.invite")}>
                <button
                  type="button"
                  aria-label={t("friends.invite")}
                  className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-3 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onInvite(id)}
                >
                  <Send size={13} />
                </button>
              </Hint>
            )}
            {unread > 0 && (
              <span
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-soft-raised px-1 font-mono text-[10px] leading-none tabular-nums text-primary"
                aria-label={t("friends.newMessage")}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-60">
        {presence.kind === "offline" && lastSeen && (
          <>
            <ContextMenuItem disabled>
              <CalendarClock size={18} />
              {t("friends.lastSeen", { value: lastSeen })}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {presence.hasJoinTarget && (
          <ContextMenuItem disabled={!canJoin} onSelect={() => onJoin(id)}>
            <Gamepad2 size={18} />
            {t("friends.join")}
          </ContextMenuItem>
        )}

        <ContextMenuItem
          disabled={!friend.isOnline}
          onSelect={() => onInvite(id)}
        >
          <Send size={18} />
          {t("friends.invite")}
        </ContextMenuItem>

        <ContextMenuItem
          disabled={!friend.isOnline || isCallDisabled}
          onSelect={() => onStartCall(id)}
        >
          <PhoneCall size={18} />
          {t("voiceCall.start")}
        </ContextMenuItem>

        {onInviteToVoice && (
          <ContextMenuItem
            disabled={!friend.isOnline}
            onSelect={() => onInviteToVoice(id)}
          >
            <Headphones size={18} />
            {t("groups.inviteToVoice")}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={() => onViewProfile(id)}>
          <User size={18} />
          {t("accountInfo.viewAccount")}
        </ContextMenuItem>

        <ContextMenuItem
          disabled={!canViewSkin}
          onSelect={() => onViewSkin(id)}
        >
          <Shirt size={18} />
          {t("skinView.title")}
        </ContextMenuItem>

        <ContextMenuItem onSelect={() => onCopyNickname(id)}>
          <Copy size={18} />
          {t("friends.copyNickname")}
        </ContextMenuItem>

        <ContextMenuItem onSelect={() => onToggleMute(id)}>
          {isMuted ? <Volume size={18} /> : <VolumeX size={18} />}
          {isMuted
            ? t("friends.enableNotifications")
            : t("friends.disableNotifications")}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem variant="destructive" onSelect={() => onRemove(id)}>
          <UserMinus size={18} />
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const FriendRow = memo(FriendRowComponent);
