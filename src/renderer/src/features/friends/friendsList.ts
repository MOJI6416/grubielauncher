import type { IFriend } from "@/types/IFriend";
import type { ActiveFriendShare } from "@/types/Share";
import type { ChatPreview, ChatPreviews } from "./chatSummary";
import {
  friendPresence,
  type FriendPresence,
  type PresenceKind,
} from "./presence";

export type FriendFilter = "all" | "online" | "unread";
export type FriendSort = "activity" | "name";

export interface FriendEntry {
  friend: IFriend;
  presence: FriendPresence;
  share?: ActiveFriendShare;
  unread: number;
  isMuted: boolean;
  isTyping: boolean;
  preview?: ChatPreview;
}

export type FriendRowDetail = "typing" | "preview" | "presence";

export function friendRowDetail(entry: {
  isTyping: boolean;
  preview?: ChatPreview;
  presence: { kind: PresenceKind };
}): FriendRowDetail {
  if (entry.isTyping) return "typing";
  if (entry.preview && entry.presence.kind !== "playing") return "preview";
  return "presence";
}

export type FriendRow =
  | { type: "section"; key: string; kind: PresenceKind; count: number }
  | { type: "friend"; key: string; entry: FriendEntry };

export interface FriendListInput {
  friends: IFriend[];
  shares: Map<string, ActiveFriendShare>;
  unread: Record<string, number>;
  muted: Set<string>;
  query: string;
  filter: FriendFilter;
  sort: FriendSort;
  previews?: ChatPreviews;
  typing?: Set<string>;
}

export interface FriendListResult {
  rows: FriendRow[];
  entries: FriendEntry[];
  counts: Record<PresenceKind, number>;
  total: number;
  matched: number;
  unreadTotal: number;
}

const SECTION_ORDER: PresenceKind[] = ["playing", "online", "offline"];

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesQuery(friend: IFriend, query: string): boolean {
  if (!query) return true;
  return friend.user.nickname.toLowerCase().includes(query);
}

function byName(a: FriendEntry, b: FriendEntry) {
  return a.friend.user.nickname.localeCompare(b.friend.user.nickname);
}

function byActivity(a: FriendEntry, b: FriendEntry) {
  const diff = b.presence.lastActiveAt - a.presence.lastActiveAt;
  return diff !== 0 ? diff : byName(a, b);
}

export function buildFriendList(input: FriendListInput): FriendListResult {
  const query = normalizeQuery(input.query);
  const counts: Record<PresenceKind, number> = {
    playing: 0,
    online: 0,
    offline: 0,
  };

  const entries: FriendEntry[] = [];
  let unreadTotal = 0;

  for (const friend of input.friends) {
    const id = friend.user._id;
    const share = input.shares.get(id);
    const presence = friendPresence(friend, share);
    const unread = input.unread[id] || 0;

    counts[presence.kind] += 1;
    unreadTotal += unread;

    if (!matchesQuery(friend, query)) continue;
    if (input.filter === "online" && presence.kind === "offline") continue;
    if (input.filter === "unread" && unread === 0) continue;

    entries.push({
      friend,
      presence,
      share,
      unread,
      isMuted: input.muted.has(id),
      isTyping: input.typing?.has(id) ?? false,
      preview: input.previews?.[id],
    });
  }

  const compare = input.sort === "name" ? byName : byActivity;
  const buckets: Record<PresenceKind, FriendEntry[]> = {
    playing: [],
    online: [],
    offline: [],
  };

  for (const entry of entries) buckets[entry.presence.kind].push(entry);
  for (const kind of SECTION_ORDER) buckets[kind].sort(compare);

  const rows: FriendRow[] = [];
  const ordered: FriendEntry[] = [];

  for (const kind of SECTION_ORDER) {
    const bucket = buckets[kind];
    if (bucket.length === 0) continue;

    rows.push({
      type: "section",
      key: `section-${kind}`,
      kind,
      count: bucket.length,
    });

    for (const entry of bucket) {
      rows.push({
        type: "friend",
        key: entry.friend.user._id,
        entry,
      });
      ordered.push(entry);
    }
  }

  return {
    rows,
    entries: ordered,
    counts,
    total: input.friends.length,
    matched: ordered.length,
    unreadTotal,
  };
}

export function steadyRows(
  frozen: readonly FriendRow[],
  rows: FriendRow[],
): FriendRow[] {
  if (frozen.length === 0) return rows;

  const byKey = new Map(rows.map((row) => [row.key, row]));
  const kept: Extract<FriendRow, { type: "friend" }>[] = [];

  for (const row of frozen) {
    if (row.type !== "friend") continue;
    const fresh = byKey.get(row.key);
    if (fresh?.type === "friend") kept.push(fresh);
  }

  const known = new Set(frozen.map((row) => row.key));
  for (const row of rows) {
    if (row.type === "friend" && !known.has(row.key)) kept.push(row);
  }

  const buckets: Record<PresenceKind, typeof kept> = {
    playing: [],
    online: [],
    offline: [],
  };

  for (const row of kept) buckets[row.entry.presence.kind].push(row);

  const visible: FriendRow[] = [];

  for (const kind of SECTION_ORDER) {
    const bucket = buckets[kind];
    if (bucket.length === 0) continue;

    visible.push({
      type: "section",
      key: `section-${kind}`,
      kind,
      count: bucket.length,
    });
    visible.push(...bucket);
  }

  return visible;
}

function previewTime(preview: ChatPreview | undefined): number {
  if (!preview?.time) return 0;
  const time = Date.parse(preview.time);
  return Number.isFinite(time) ? time : 0;
}

export function recentChats(
  entries: readonly FriendEntry[],
  limit: number,
): FriendEntry[] {
  return entries
    .map((entry, index) => ({ entry, index, time: previewTime(entry.preview) }))
    .filter(
      (item) =>
        item.entry.presence.kind !== "playing" &&
        (item.entry.unread > 0 || Boolean(item.entry.preview)),
    )
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((item) => item.entry);
}

export function nextFriendIndex(
  rows: FriendRow[],
  currentId: string | undefined,
  step: 1 | -1,
): string | undefined {
  const friendRows = rows.filter((row) => row.type === "friend");
  if (friendRows.length === 0) return undefined;

  const current = friendRows.findIndex((row) => row.key === currentId);
  if (current === -1) {
    return step === 1
      ? friendRows[0].key
      : friendRows[friendRows.length - 1].key;
  }

  const next = current + step;
  if (next < 0 || next >= friendRows.length) return friendRows[current].key;
  return friendRows[next].key;
}
