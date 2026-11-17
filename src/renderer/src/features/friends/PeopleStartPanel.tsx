import type { TFunction } from "i18next";
import {
  CircleAlert,
  Copy,
  Gamepad2,
  MessagesSquare,
  Play,
  PlugZap,
  RotateCw,
  Send,
  UserPlus,
  Users,
} from "lucide-react";
import { HeadDot, PlayerHead } from "@renderer/features/accounts/AccountHead";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatRelative } from "@renderer/utilities/date";
import { canJoinFriend, presenceDotColor } from "./presence";
import { PlatformIcon } from "./PlatformIcon";
import type { FriendEntry } from "./friendsList";
import { useRedact } from "@renderer/features/streamer/streamerMode";

interface PeopleStartPanelProps {
  playing: FriendEntry[];
  chats: FriendEntry[];
  hasFriends: boolean;
  isSignedOut: boolean;
  isLoading: boolean;
  listError?: string | null;
  summaryError?: string | null;
  isSummaryPending?: boolean;
  onReloadFriends: () => void;
  isGameRunning: boolean;
  ownFriendCode?: string;
  friendRequestsEnabled: boolean;
  onSignIn: () => void;
  describePresence: (entry: FriendEntry) => string;
  describeChat: (entry: FriendEntry) => string;
  onJoin: (friendId: string) => void;
  onInvite: (friendId: string) => void;
  onOpenChat: (friendId: string) => void;
  onAddFriend: () => void;
  onCopyCode: () => void;
  t: TFunction;
}

function FriendCard({
  entry,
  isGameRunning,
  detail,
  meta,
  onJoin,
  onInvite,
  onOpenChat,
  t,
}: {
  entry: FriendEntry;
  isGameRunning: boolean;
  detail: string;
  meta?: string;
  onJoin: (friendId: string) => void;
  onInvite: (friendId: string) => void;
  onOpenChat: (friendId: string) => void;
  t: TFunction;
}) {
  const { friend, presence, unread } = entry;
  const id = friend.user._id;
  const canJoin = canJoinFriend(presence, isGameRunning);
  const canInvite = !canJoin && friend.isOnline && isGameRunning;

  return (
    <div className="flex h-14 min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 transition-colors hover:bg-surface-3">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpenChat(id)}
      >
        <PlayerHead
          user={friend.user}
          size={36}
          badge={<HeadDot className={presenceDotColor(presence.kind)} />}
        />

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <Hint content={friend.user.nickname} variant="text" truncatedOnly>
              <span className="min-w-0 truncate text-sm font-medium">
                {friend.user.nickname}
              </span>
            </Hint>
            <span className="shrink-0 text-faint">
              <PlatformIcon platform={friend.user.platform} />
            </span>
            {meta && (
              <span className="ml-auto shrink-0 text-3xs text-faint">
                {meta}
              </span>
            )}
          </span>
          <Hint content={detail} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-2xs leading-4 text-muted-foreground">
              {detail}
            </span>
          </Hint>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {unread > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-info/15 px-1 font-mono text-3xs leading-none tabular-nums text-info">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
        {canJoin && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-2xs"
            onClick={() => onJoin(id)}
          >
            <Play className="size-3" />
            {t("friends.joinFlow.playAction")}
          </Button>
        )}
        {canInvite && (
          <Hint content={t("friends.invite")}>
            <Button
              size="icon-sm"
              variant="outline"
              className="size-7"
              aria-label={t("friends.invite")}
              onClick={() => onInvite(id)}
            >
              <Send className="size-3" />
            </Button>
          </Hint>
        )}
      </div>
    </div>
  );
}

export function PeopleStartPanel({
  playing,
  chats,
  hasFriends,
  isSignedOut,
  isLoading,
  listError,
  summaryError,
  isSummaryPending,
  onReloadFriends,
  isGameRunning,
  ownFriendCode,
  friendRequestsEnabled,
  describePresence,
  describeChat,
  onJoin,
  onInvite,
  onOpenChat,
  onAddFriend,
  onCopyCode,
  onSignIn,
  t,
}: PeopleStartPanelProps) {
  const redact = useRedact();
  const hasContent = hasFriends || playing.length > 0 || chats.length > 0;
  const chatTime = (value: string | null | undefined) =>
    value ? formatRelative(new Date(value)) : "";
  const reasonOf = (code: string) => {
    const key = `friends.operationErrors.${code}`;
    const text = t(key);
    return text === key ? t("friends.operationErrors.unknown") : text;
  };

  if (isSignedOut && !hasContent) {
    return (
      <Empty className="min-h-0 overflow-hidden rounded-xl border border-solid border-border bg-card px-8">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-warning">
            <PlugZap />
          </EmptyMedia>
          <EmptyTitle>{t("friends.sessionLost")}</EmptyTitle>
          <EmptyDescription className="text-xs leading-5">
            {t("friends.sessionLostHint")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onSignIn}>{t("accounts.signIn")}</Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (listError && !hasContent) {
    const reason = reasonOf(listError);

    return (
      <Empty className="min-h-0 overflow-hidden rounded-xl border border-solid border-border bg-card px-8">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-warning">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("friends.listLoadError")}</EmptyTitle>
          <EmptyDescription className="text-xs leading-5">
            {reason}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onReloadFriends}>
            <RotateCw className="size-4" />
            {t("common.retry")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {(isLoading || hasContent) && (
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Gamepad2 className="size-4 text-faint" />
          <p className="text-sm font-medium">{t("friends.nowPlayingTitle")}</p>
          <span className="font-mono text-xs tabular-nums text-faint">
            {playing.length}
          </span>
        </div>
      )}

      {isLoading && !hasContent ? (
        <div
          aria-busy
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3"
        >
          <div className="grid shrink-0 grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex h-14 min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5"
              >
                <Skeleton className="size-9 shrink-0 rounded-md" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-24 rounded" />
                  <Skeleton className="h-2.5 w-32 rounded" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 flex-col gap-1.5">
            <Skeleton className="h-2.5 w-20 rounded" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="flex h-14 min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5"
                >
                  <Skeleton className="size-9 shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24 rounded" />
                    <Skeleton className="h-2.5 w-28 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : hasContent ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {playing.length > 0 ? (
            <div className="min-h-0 overflow-x-hidden overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                {playing.map((entry) => (
                  <FriendCard
                    key={entry.friend.user._id}
                    entry={entry}
                    isGameRunning={isGameRunning}
                    detail={describePresence(entry)}
                    onJoin={onJoin}
                    onInvite={onInvite}
                    onOpenChat={onOpenChat}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Empty className="flex-none flex-row justify-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left">
              <Users className="size-4 shrink-0 text-faint" />
              <EmptyDescription className="min-w-0 text-xs leading-4">
                {t("friends.nobodyPlayingHint")}
              </EmptyDescription>
            </Empty>
          )}

          {chats.length > 0 ? (
            <div className="flex min-h-0 flex-col gap-1.5">
              <p className="shrink-0 px-0.5 text-3xs font-medium tracking-wide text-faint uppercase">
                {t("friends.recentTitle")}
              </p>
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {chats.map((entry) => (
                    <FriendCard
                      key={entry.friend.user._id}
                      entry={entry}
                      isGameRunning={isGameRunning}
                      detail={describeChat(entry)}
                      meta={chatTime(entry.preview?.time)}
                      onJoin={onJoin}
                      onInvite={onInvite}
                      onOpenChat={onOpenChat}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : isSummaryPending ? (
            <div className="flex min-h-0 flex-col gap-1.5">
              <p className="shrink-0 px-0.5 text-3xs font-medium tracking-wide text-faint uppercase">
                {t("friends.recentTitle")}
              </p>
              <div aria-busy className="grid shrink-0 grid-cols-2 gap-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex h-14 min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5"
                  >
                    <Skeleton className="size-9 shrink-0 rounded-md" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-2.5 w-28 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : summaryError ? (
            <div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-dashed border-border py-1.5 pr-1.5 pl-3">
              <CircleAlert className="size-4 shrink-0 text-warning" />
              <p className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t("friends.chatsLoadError")}
                </span>{" "}
                {reasonOf(summaryError)}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                onClick={onReloadFriends}
              >
                <RotateCw className="size-3.5" />
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <Empty className="flex-none flex-row justify-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left">
              <MessagesSquare className="size-4 shrink-0 text-faint" />
              <EmptyDescription className="min-w-0 text-xs leading-4">
                <span className="font-medium text-foreground">
                  {t("friends.noChatsTitle")}
                </span>{" "}
                {t("friends.noChatsHint")}
              </EmptyDescription>
            </Empty>
          )}

          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-6 py-3 text-center">
            <p className="text-sm font-medium">{t("friends.friendCode")}</p>

            {ownFriendCode && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-1.5">
                <span className="font-mono text-lg font-semibold tracking-[0.14em] select-all">
                  {redact.value(ownFriendCode)}
                </span>
                <Hint content={t("common.copy")}>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-6"
                    aria-label={t("common.copy")}
                    onClick={onCopyCode}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </Hint>
              </div>
            )}

            {!ownFriendCode ? (
              <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                {t("friends.friendCodeUnavailable")}
              </p>
            ) : friendRequestsEnabled ? (
              <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                {t("friends.friendCodeDescription")}
              </p>
            ) : (
              <p className="max-w-sm text-xs leading-5 text-warning">
                <CircleAlert className="mr-1 inline size-3.5 -translate-y-px" />
                {t("friends.friendCodeDisabledHint")}
              </p>
            )}

            <Button size="sm" variant="secondary" onClick={onAddFriend}>
              <UserPlus className="size-4" />
              {t("friends.addFriend")}
            </Button>
          </div>
        </div>
      ) : (
        <Empty className="min-h-0 px-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>{t("friends.noFriends")}</EmptyTitle>
            <EmptyDescription className="text-xs leading-5">
              {t("friends.noFriendsHint")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onAddFriend}>
              <UserPlus className="size-4" />
              {t("friends.addFriend")}
            </Button>

            {ownFriendCode && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5">
                <span className="font-mono text-sm tracking-[0.15em] select-all">
                  {redact.value(ownFriendCode)}
                </span>
                <Hint content={t("common.copy")}>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-6"
                    aria-label={t("common.copy")}
                    onClick={onCopyCode}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </Hint>
              </div>
            )}

            {ownFriendCode && !friendRequestsEnabled && (
              <p className="max-w-sm text-xs leading-5 text-warning">
                <CircleAlert className="mr-1 inline size-3.5 -translate-y-px" />
                {t("friends.friendCodeDisabledHint")}
              </p>
            )}
          </EmptyContent>
        </Empty>
      )}
    </section>
  );
}
