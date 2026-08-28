import type { IFriend } from "@/types/IFriend";

function timeOf(value: unknown): number {
  const time = new Date(value as string).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function applyFriendUpdate(
  friends: IFriend[],
  update: IFriend,
  now: number = Date.now(),
): IFriend[] {
  const id = update?.user?._id;
  if (!id) return friends;

  const index = friends.findIndex((friend) => friend.user._id === id);
  if (index === -1) return friends;

  const current = friends[index];
  const currentTime = timeOf(current.user.lastActive);
  const updateTime = timeOf(update.user?.lastActive);
  const wentOffline = current.isOnline && !update.isOnline;

  const lastActive =
    updateTime > currentTime
      ? update.user.lastActive
      : wentOffline && now > currentTime
        ? new Date(now)
        : current.user.lastActive;

  const next = [...friends];
  next[index] = {
    ...current,
    isOnline: update.isOnline,
    versionCode: update.versionCode,
    versionName: update.versionName,
    serverAddress: update.serverAddress,
    user: {
      ...current.user,
      lastActive,
      image: update.user?.image ?? current.user.image,
      nickname: update.user?.nickname || current.user.nickname,
    },
  };

  return next;
}

export function sortRequests<T extends { type: "requester" | "recipient" }>(
  requests: T[],
): { incoming: T[]; outgoing: T[] } {
  const incoming: T[] = [];
  const outgoing: T[] = [];

  for (const request of requests) {
    if (request.type === "recipient") incoming.push(request);
    else outgoing.push(request);
  }

  return { incoming, outgoing };
}
