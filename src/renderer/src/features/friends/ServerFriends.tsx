import { useMemo } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { MessageSquare, Play } from "lucide-react";
import type { IFriend } from "@/types/IFriend";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { HeadDot, PlayerHead } from "@renderer/features/accounts/AccountHead";
import {
  consolesMetaAtom,
  friendsAtom,
  pendingFriendChatAtom,
} from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { joinFriendWorld } from "@renderer/features/launch/joinFriendWorld";
import { countFeature } from "@renderer/features/usage/usage";
import { PlatformIcon } from "./PlatformIcon";
import { canJoinFriend, friendPresence, presenceDotColor } from "./presence";
import {
  type FriendsByServer,
  friendsOn,
  groupFriendsByServer,
} from "./friendsOnServers";

const MAX_HEADS = 3;

export function useFriendsByServer(): FriendsByServer {
  const friends = useAtomValue(friendsAtom);
  return useMemo(() => groupFriendsByServer(friends), [friends]);
}

export function openFriendChat(friendId: string) {
  getDefaultStore().set(pendingFriendChatAtom, friendId);
  navigate({ name: "people", section: "friends" });
}

export function FriendHeads({
  friends,
  className,
}: {
  friends: IFriend[];
  className?: string;
}) {
  const { t } = useTranslation();
  if (friends.length === 0) return null;

  const shown = friends.slice(0, MAX_HEADS);
  const rest = friends.length - shown.length;

  return (
    <span
      role="img"
      aria-label={t("friends.here.label", {
        names: friends.map((friend) => friend.user.nickname).join(", "),
      })}
      className={cn("flex shrink-0 items-center", className)}
    >
      {shown.map((friend, index) => (
        <PlayerHead
          key={friend.user._id}
          user={friend.user}
          size={18}
          className={cn(
            "rounded-md ring-2 ring-success/70",
            index > 0 && "-ml-1.5",
          )}
        />
      ))}
      {rest > 0 && (
        <span className="ml-1 font-mono text-3xs tabular-nums text-success">
          +{rest}
        </span>
      )}
    </span>
  );
}

export function FriendPresenceCard({
  friend,
  raised = "bg-surface-2",
}: {
  friend: IFriend;
  raised?: string;
}) {
  const { t } = useTranslation();
  const consoles = useAtomValue(consolesMetaAtom);
  const isGameRunning = consoles.some((meta) => meta.status === "running");
  const presence = friendPresence(friend);
  const canJoin = canJoinFriend(presence, isGameRunning);
  const id = friend.user._id;

  const detail = presence.versionName
    ? t("friends.here.inBuild", { name: presence.versionName })
    : t("friends.playing");
  const reason = !presence.joinVersionCode
    ? t("friends.here.notPublished")
    : isGameRunning
      ? t("friends.here.gameRunning")
      : "";

  const join = () => {
    void joinFriendWorld({
      versionCode: presence.joinVersionCode,
      hostNickname: friend.user.nickname,
      hostUserId: id,
      address: friend.serverAddress || undefined,
    });
  };

  const write = () => {
    countFeature("friends.serverChat");
    openFriendChat(id);
  };

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border border-border px-2 py-1.5",
        raised,
      )}
    >
      <PlayerHead
        user={friend.user}
        size={30}
        badge={
          <HeadDot
            label={t("friends.playing")}
            className={presenceDotColor(presence.kind)}
          />
        }
      />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <Hint content={friend.user.nickname} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              {friend.user.nickname}
            </span>
          </Hint>
          <span className="shrink-0 text-faint">
            <PlatformIcon platform={friend.user.platform} />
          </span>
        </span>
        <Hint content={detail} variant="text" truncatedOnly>
          <span className="min-w-0 truncate text-2xs leading-4 text-muted-foreground">
            {detail}
          </span>
        </Hint>
        {reason && (
          <Hint content={reason} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-3xs leading-4 text-faint">
              {reason}
            </span>
          </Hint>
        )}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <Hint content={t("friends.join")}>
          <span className="inline-flex">
            <Button
              size="icon-sm"
              variant="outline"
              className="size-7"
              aria-label={t("friends.join")}
              disabled={!canJoin}
              onClick={join}
            >
              <Play className="size-3.5" />
            </Button>
          </span>
        </Hint>
        <Hint content={t("friends.chat")}>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7"
            aria-label={t("friends.chat")}
            onClick={write}
          >
            <MessageSquare className="size-3.5" />
          </Button>
        </Hint>
      </div>
    </div>
  );
}

export function ServerFriendsSection({
  groups,
  address,
  raised,
  className,
}: {
  groups: FriendsByServer;
  address: string | null | undefined;
  raised?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const friends = friendsOn(groups, address);
  if (friends.length === 0) return null;

  return (
    <section className={cn("flex shrink-0 flex-col gap-1.5", className)}>
      <p className="flex items-center gap-1.5 text-3xs font-medium tracking-wide text-faint uppercase">
        <span className="size-1.5 rounded-full bg-success" />
        {t("friends.here.title")}
        <span className="font-mono tabular-nums">{friends.length}</span>
      </p>
      {friends.map((friend) => (
        <FriendPresenceCard
          key={friend.user._id}
          friend={friend}
          raised={raised}
        />
      ))}
    </section>
  );
}
