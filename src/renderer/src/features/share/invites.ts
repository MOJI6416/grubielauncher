import type { IFriend } from "@/types/IFriend";
import type { IUser } from "@/types/IUser";

export type InviteState = "ready" | "sending" | "sent" | "joined" | "offline";

export interface InviteCandidate {
  id: string;
  nickname: string;
  platform: IUser["platform"] | null;
  uuid: string | null;
  state: InviteState;
  place: string;
}

const STATE_ORDER: Record<InviteState, number> = {
  ready: 0,
  sending: 0,
  sent: 1,
  joined: 2,
  offline: 3,
};

export function matchesInviteQuery(nickname: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return nickname.toLowerCase().includes(needle);
}

export function buildInviteCandidates({
  friends,
  joinedUserIds,
  sentIds,
  sendingIds,
  query,
}: {
  friends: IFriend[];
  joinedUserIds: Set<string>;
  sentIds: Set<string>;
  sendingIds: Set<string>;
  query: string;
}): InviteCandidate[] {
  const candidates: InviteCandidate[] = [];

  for (const friend of friends) {
    const id = friend.user?._id;
    if (!id) continue;
    if (!matchesInviteQuery(friend.user.nickname, query)) continue;

    const state: InviteState = joinedUserIds.has(id)
      ? "joined"
      : sendingIds.has(id)
        ? "sending"
        : sentIds.has(id)
          ? "sent"
          : friend.isOnline
            ? "ready"
            : "offline";

    candidates.push({
      id,
      nickname: friend.user.nickname,
      platform: friend.user.platform,
      uuid: friend.user.uuid,
      state,
      place: friend.isOnline ? friend.serverAddress || friend.versionName : "",
    });
  }

  return candidates.sort((a, b) => {
    const order = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (order !== 0) return order;
    return a.nickname.localeCompare(b.nickname);
  });
}

export function countInvitable(candidates: InviteCandidate[]): number {
  return candidates.filter((candidate) => candidate.state === "ready").length;
}
