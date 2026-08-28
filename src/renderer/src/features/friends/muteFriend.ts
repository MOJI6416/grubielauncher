import type { ILocalFriend } from "@/types/ILocalFriend";

export interface MuteToggle {
  next: ILocalFriend[];
  isMuted: boolean;
}

export function mutedFriendIds(
  friends: readonly ILocalFriend[] | undefined,
): Set<string> {
  const muted = new Set<string>();
  for (const entry of friends ?? []) {
    if (entry?.isMuted && entry.id) muted.add(entry.id);
  }
  return muted;
}

export function toggleMutedFriend(
  friends: ILocalFriend[],
  friendId: string,
): MuteToggle {
  const current = friends.find((entry) => entry.id === friendId);
  const isMuted = current ? !current.isMuted : true;

  return {
    isMuted,
    next: current
      ? friends.map((entry) =>
          entry.id === friendId ? { ...entry, isMuted } : entry,
        )
      : [...friends, { id: friendId, isMuted }],
  };
}
