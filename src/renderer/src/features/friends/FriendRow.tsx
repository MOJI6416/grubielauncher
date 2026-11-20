import { memo } from "react";
import type { TFunction } from "i18next";
import { Play, Send, VolumeX } from "lucide-react";
import { HeadDot, PlayerHead } from "@renderer/features/accounts/AccountHead";
import { Hint } from "@renderer/components/Hint";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { formatRelative } from "@renderer/utilities/date";
import { describePreview } from "./chatSummary";
import { friendRowDetail, type FriendEntry } from "./friendsList";
import { canJoinFriend, joinBlockReason, presenceDotColor } from "./presence";
import { FriendMenuItems, type FriendMenuActions } from "./FriendMenuItems";
import { PlatformIcon } from "./PlatformIcon";
import { maskValue } from "@renderer/features/streamer/redact";
import type { ShareGuestLink } from "@/types/Share";
import { TransportBadge } from "@renderer/features/share/TransportBadge";
import { useRedact } from "@renderer/features/streamer/streamerMode";

export interface FriendRowActions extends FriendMenuActions {
  onOpenChat: (friendId: string) => void;
}

interface FriendRowProps extends FriendRowActions {
  entry: FriendEntry;
  isActive: boolean;
  isGameRunning: boolean;
  isCallBusy: boolean;
  ownUserId?: string;
  voiceRoomId?: string;
  guestLink?: ShareGuestLink;
  t: TFunction;
}

export function describePresence(
  entry: FriendEntry,
  t: TFunction,
  streamer = false,
) {
  const { presence } = entry;

  if (presence.kind === "offline") {
    const value = presence.lastActiveAt
      ? formatRelative(new Date(presence.lastActiveAt))
      : "";
    return value ? t("friends.lastSeen", { value }) : t("friends.offline");
  }

  const place =
    presence.place?.kind === "server"
      ? streamer
        ? maskValue(presence.place.address)
        : presence.place.address
      : presence.place?.kind === "sharedWorld"
        ? t("friends.sharedWorld")
        : presence.place?.kind === "world"
          ? presence.place.address
          : "";

  const parts = [presence.versionName, place].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : t("friends.online");
}

export function describeJoinBlock(
  entry: FriendEntry,
  isGameRunning: boolean,
  t: TFunction,
  length: "short" | "long",
): string {
  const reason = joinBlockReason(entry.presence, isGameRunning);
  if (!reason) return "";
  return t(
    length === "short"
      ? `friends.joinReasonShort.${reason}`
      : `friends.joinReason.${reason}`,
  );
}

export function describeRowDetail(
  entry: FriendEntry,
  ownUserId: string | undefined,
  t: TFunction,
  streamer = false,
): string {
  const detail = friendRowDetail(entry);
  if (detail === "typing") return t("friends.chatTyping");

  if (detail === "preview" && streamer) return t("streamer.messageHidden");

  if (detail === "preview") {
    const preview = describePreview(entry.preview, ownUserId);
    if (preview) {
      const body = preview.labelKey ? t(preview.labelKey) : preview.text;
      return preview.isOwn ? `${t("friends.you")}: ${body}` : body;
    }
  }

  return describePresence(entry, t, streamer);
}

function FriendRowComponent({
  entry,
  isActive,
  isGameRunning,
  isCallBusy,
  ownUserId,
  voiceRoomId,
  guestLink,
  t,
  onOpenChat,
  ...actions
}: FriendRowProps) {
  const { friend, presence, unread, isMuted } = entry;
  const id = friend.user._id;
  const canJoin = canJoinFriend(presence, isGameRunning);
  const canInvite = friend.isOnline && isGameRunning;
  const detailKind = friendRowDetail(entry);
  const streamer = useRedact().active;
  const blocked =
    detailKind === "presence"
      ? describeJoinBlock(entry, false, t, "short")
      : "";
  const detail = [describeRowDetail(entry, ownUserId, t, streamer), blocked]
    .filter(Boolean)
    .join(" · ");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group flex h-12 w-full min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 transition-colors",
            isActive ? "bg-row-selected" : "hover:bg-row-hover",
            "has-[[data-state=open]]:bg-row-hover",
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
                    "min-w-0 truncate text-2xs leading-4",
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
            {guestLink && (
              <TransportBadge
                transport={guestLink.transport}
                rttMs={guestLink.rttMs}
                t={t}
              />
            )}
            {canJoin && (
              <Hint content={t("friends.join")}>
                <button
                  type="button"
                  aria-label={t("friends.join")}
                  className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-3 text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => actions.onJoin(id)}
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
                  onClick={() => actions.onInvite(id)}
                >
                  <Send size={13} />
                </button>
              </Hint>
            )}
            {unread > 0 && (
              <span
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-info/15 px-1 font-mono text-3xs leading-none tabular-nums text-info"
                aria-label={t("friends.newMessage")}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-60">
        <FriendMenuItems
          menu="context"
          entry={entry}
          isGameRunning={isGameRunning}
          isCallBusy={isCallBusy}
          ownUserId={ownUserId}
          voiceRoomId={voiceRoomId}
          actions={actions}
          t={t}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const FriendRow = memo(FriendRowComponent);
