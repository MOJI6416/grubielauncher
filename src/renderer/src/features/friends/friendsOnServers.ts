import type { IFriend } from "@/types/IFriend";
import { normalizeAddress } from "@renderer/features/servers/serverList";

export type FriendsByServer = Map<string, IFriend[]>;

export function serverKey(address: string | null | undefined): string {
  return address ? normalizeAddress(address) : "";
}

export function groupFriendsByServer(friends: IFriend[]): FriendsByServer {
  const groups: FriendsByServer = new Map();

  for (const friend of friends) {
    if (!friend.isOnline) continue;
    const key = serverKey(friend.serverAddress);
    if (!key) continue;

    const list = groups.get(key);
    if (list) list.push(friend);
    else groups.set(key, [friend]);
  }

  for (const list of groups.values()) {
    list.sort((a, b) =>
      a.user.nickname.localeCompare(b.user.nickname, undefined, {
        sensitivity: "base",
      }),
    );
  }

  return groups;
}

export function friendsOn(
  groups: FriendsByServer,
  address: string | null | undefined,
): IFriend[] {
  const key = serverKey(address);
  return key ? (groups.get(key) ?? []) : [];
}
