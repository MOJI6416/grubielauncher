import type { IFriendRequest } from "@/types/IFriend";
import type { IGroupInvite } from "@/types/Voice";
import { applyChatsSummary, type ChatSummary } from "./chatSummary";
import type { FriendEntry } from "./friendsList";
import { serverKey } from "./friendsOnServers";
import { totalUnread, type UnreadCounts } from "./unread";

export type FriendPlaceKind = "server" | "sharedWorld" | "world";

export interface FriendPlace {
  key: string;
  kind: FriendPlaceKind;
  address: string;
  hostNickname: string;
  entries: FriendEntry[];
  lead: FriendEntry;
}

function placeKey(entry: FriendEntry): string | null {
  const place = entry.presence.place;
  if (entry.presence.kind !== "playing" || !place) return null;
  if (place.kind === "server") {
    const key = serverKey(place.address);
    return key ? `server:${key}` : null;
  }
  return `share:${entry.share?.hostUserId ?? entry.friend.user._id}`;
}

function placeLabel(place: FriendPlace): string {
  return place.kind === "server" ? place.address : place.hostNickname;
}

export function friendPlaces(entries: FriendEntry[]): FriendPlace[] {
  const places = new Map<string, FriendPlace>();

  for (const entry of entries) {
    const key = placeKey(entry);
    const place = entry.presence.place;
    if (!key || !place) continue;

    const known = places.get(key);
    if (known) {
      known.entries.push(entry);
      if (!known.lead.presence.joinVersionCode && entry.presence.joinVersionCode) {
        known.lead = entry;
      }
      continue;
    }

    places.set(key, {
      key,
      kind: place.kind,
      address: place.kind === "sharedWorld" ? "" : place.address,
      hostNickname: entry.share?.hostNickname || entry.friend.user.nickname,
      entries: [entry],
      lead: entry,
    });
  }

  return [...places.values()].sort(
    (a, b) =>
      b.entries.length - a.entries.length ||
      placeLabel(a).localeCompare(placeLabel(b), undefined, {
        sensitivity: "base",
      }),
  );
}

export type FreshRequest =
  | { kind: "group"; key: string; invite: IGroupInvite }
  | { kind: "friend"; key: string; request: IFriendRequest };

export function freshRequests(
  incoming: IFriendRequest[],
  invites: IGroupInvite[],
  limit: number,
): { items: FreshRequest[]; total: number } {
  const groups = [...invites]
    .sort(
      (a, b) =>
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
    )
    .map<FreshRequest>((invite) => ({
      kind: "group",
      key: `group:${invite._id}`,
      invite,
    }));
  const friends = [...incoming]
    .reverse()
    .map<FreshRequest>((request) => ({
      kind: "friend",
      key: `friend:${request.requestId}`,
      request,
    }));

  const all = [...friends, ...groups];
  return { items: all.slice(0, Math.max(0, limit)), total: all.length };
}

export interface PeopleBadgeInput {
  unread: UnreadCounts;
  groupUnreads: Record<string, number>;
  mutedGroups: string[];
  incomingRequests: number;
  groupInvites: number;
}

export function peopleBadgeCount(input: PeopleBadgeInput): number {
  const muted = new Set(input.mutedGroups);
  let groups = 0;
  for (const [id, count] of Object.entries(input.groupUnreads)) {
    if (!muted.has(id) && count > 0) groups += count;
  }

  return (
    totalUnread(input.unread) +
    groups +
    Math.max(0, input.incomingRequests) +
    Math.max(0, input.groupInvites)
  );
}

export function unreadFromSummary(
  summaries: ChatSummary[],
  previous: UnreadCounts,
): UnreadCounts {
  return applyChatsSummary(summaries, { previews: {}, unread: previous }).unread;
}

export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}
