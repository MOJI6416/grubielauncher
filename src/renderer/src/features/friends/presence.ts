import type { IFriend } from "@/types/IFriend";
import type { ActiveFriendShare } from "@/types/Share";

export type PresenceKind = "playing" | "online" | "offline";

export type PresencePlace =
  | { kind: "server"; address: string }
  | { kind: "sharedWorld" }
  | { kind: "world"; address: string };

export interface FriendPresence {
  kind: PresenceKind;
  versionName: string;
  place: PresencePlace | null;
  hasJoinTarget: boolean;
  joinVersionCode: string;
  lastActiveAt: number;
}

const HOSTED_SHARE_HOST = "join.grubielauncher.com";

export function friendLastActiveAt(friend: IFriend): number {
  const value = new Date(friend.user.lastActive).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function friendPresence(
  friend: IFriend,
  share?: ActiveFriendShare,
): FriendPresence {
  const lastActiveAt = friendLastActiveAt(friend);
  const versionName = friend.versionName || "";
  const joinVersionCode = share?.versionShareCode || friend.versionCode || "";

  if (!friend.isOnline) {
    return {
      kind: "offline",
      versionName: "",
      place: null,
      hasJoinTarget: false,
      joinVersionCode: "",
      lastActiveAt,
    };
  }

  const place: PresencePlace | null = friend.serverAddress
    ? { kind: "server", address: friend.serverAddress }
    : share
      ? share.publicAddress.includes(HOSTED_SHARE_HOST)
        ? { kind: "sharedWorld" }
        : { kind: "world", address: share.publicAddress }
      : null;

  const kind: PresenceKind = versionName || place ? "playing" : "online";

  return {
    kind,
    versionName,
    place,
    hasJoinTarget: Boolean(joinVersionCode && place),
    joinVersionCode,
    lastActiveAt,
  };
}

export function canJoinFriend(
  presence: FriendPresence,
  isGameRunning: boolean,
): boolean {
  return presence.kind === "playing" && presence.hasJoinTarget && !isGameRunning;
}

export function presenceDotColor(kind: PresenceKind): string {
  if (kind === "playing") return "bg-loader-vanilla";
  if (kind === "online") return "bg-success";
  return "bg-muted-foreground";
}
