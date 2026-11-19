import type { IFriend } from "@/types/IFriend";
import {
  isOnline,
  isPlaying,
  normalizeProfileId,
  type MsFriend,
  type MsFriendsSnapshot,
  type MsPresenceStatus,
} from "@/shared/msFriends";
import type { PresenceKind } from "./presence";
import { normalizeQuery, type FriendFilter } from "./friendsList";

const KIND_ORDER: Record<PresenceKind, number> = {
  playing: 0,
  online: 1,
  offline: 2,
};

export function msPresenceKind(status: MsPresenceStatus | undefined): PresenceKind {
  if (isPlaying(status)) return "playing";
  if (isOnline(status)) return "online";
  return "offline";
}

export function msStatusKey(status: MsPresenceStatus | undefined): string {
  switch (status) {
    case "PLAYING_OFFLINE":
      return "friends.microsoft.status.singleplayer";
    case "PLAYING_SERVER":
      return "friends.microsoft.status.server";
    case "PLAYING_REALMS":
      return "friends.microsoft.status.realms";
    case "PLAYING_HOSTED_SERVER":
      return "friends.microsoft.status.hosted";
    case "ONLINE":
      return "friends.online";
    case "OFFLINE":
      return "friends.offline";
    default:
      return "friends.microsoft.status.unknown";
  }
}

export function grubieProfileIds(friends: IFriend[]): Set<string> {
  const ids = new Set<string>();
  for (const friend of friends) {
    if (friend.user.platform !== "microsoft") continue;
    const id = normalizeProfileId(friend.user.uuid);
    if (id) ids.add(id);
  }
  return ids;
}

export function withoutGrubieFriends(
  msFriends: MsFriend[],
  friends: IFriend[],
): MsFriend[] {
  const known = grubieProfileIds(friends);
  return msFriends.filter((friend) => !known.has(friend.profileId));
}

export function listMsFriends(
  msFriends: MsFriend[],
  friends: IFriend[],
  query: string,
  filter: FriendFilter,
): MsFriend[] {
  if (filter === "unread") return [];
  const needle = normalizeQuery(query);
  return withoutGrubieFriends(msFriends, friends)
    .filter((friend) => !needle || friend.name.toLowerCase().includes(needle))
    .filter((friend) => filter !== "online" || isOnline(friend.status))
    .sort((a, b) => {
      const byKind =
        KIND_ORDER[msPresenceKind(a.status)] - KIND_ORDER[msPresenceKind(b.status)];
      return byKind !== 0 ? byKind : a.name.localeCompare(b.name);
    });
}

export function mergeSnapshot(
  previous: MsFriendsSnapshot | null,
  next: MsFriendsSnapshot,
): MsFriendsSnapshot {
  if (!previous) return next;
  const known = new Map(previous.friends.map((friend) => [friend.profileId, friend]));
  return {
    ...next,
    friends: next.friends.map((friend) =>
      friend.status
        ? friend
        : {
            ...friend,
            status: known.get(friend.profileId)?.status,
            lastUpdated: known.get(friend.profileId)?.lastUpdated,
          },
    ),
  };
}
