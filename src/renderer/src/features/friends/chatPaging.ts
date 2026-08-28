import type { IMessage } from "@/types/IMessage";
import { toChatEntries, unsentEntries, type ChatEntry } from "./chatEntries";

export const CHAT_PAGE_SIZE = 50;
export const ECHO_SKEW_MS = 60_000;

export interface HistoryPage {
  messages?: unknown;
  hasMore?: unknown;
  cursor?: unknown;
}

export interface HistoryState {
  entries: ChatEntry[];
  cursor: number | null;
  hasMore: boolean;
}

export interface HistoryMerge extends HistoryState {
  mode: "replace" | "prepend";
  added: number;
}

function toCursor(value: unknown): number | null {
  const cursor = Number(value);
  return Number.isFinite(cursor) && cursor > 0 ? Math.trunc(cursor) : null;
}

function seqOf(entry: ChatEntry): number | null {
  const seq = Number(entry.message.seq);
  return Number.isFinite(seq) ? seq : null;
}

export function oldestSeq(entries: ChatEntry[]): number | null {
  let oldest: number | null = null;

  for (const entry of entries) {
    const seq = seqOf(entry);
    if (seq === null) continue;
    if (oldest === null || seq < oldest) oldest = seq;
  }

  return oldest;
}

export function newestSeq(entries: ChatEntry[]): number | null {
  let newest: number | null = null;

  for (const entry of entries) {
    const seq = seqOf(entry);
    if (seq === null) continue;
    if (newest === null || seq > newest) newest = seq;
  }

  return newest;
}

export function fresherThanPage(
  entries: ChatEntry[],
  incoming: ChatEntry[],
): ChatEntry[] {
  const boundary = newestSeq(incoming);
  const known = new Set(
    incoming.map((entry) => entry.message.id).filter(Boolean),
  );

  return entries.filter((entry) => {
    if (entry.status !== "sent") return false;

    const id = entry.message.id;
    if (!id || known.has(id)) return false;

    const seq = seqOf(entry);
    if (seq === null) return false;

    return boundary === null || seq > boundary;
  });
}

function isOlderPage(entries: ChatEntry[], incoming: ChatEntry[]): boolean {
  if (incoming.length === 0) return true;

  const boundary = oldestSeq(entries);
  if (boundary === null) return false;

  const seq = seqOf(incoming[0]);
  return seq !== null && seq < boundary;
}

function bodyKey(entry: ChatEntry): string {
  const body = entry.message.message;
  return [entry.message.sender, body?._type, body?.value].join("|");
}

function timeOf(entry: ChatEntry): number {
  const time = new Date(entry.message.time).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function knownMessageIds(entries: ChatEntry[]): Set<string> {
  const ids = new Set<string>();

  for (const entry of entries) {
    if (entry.status !== "sent") continue;
    const id = entry.message.id;
    if (id) ids.add(id);
  }

  return ids;
}

export function dropEchoedDrafts(
  incoming: ChatEntry[],
  drafts: ChatEntry[],
  known?: ReadonlySet<string>,
): ChatEntry[] {
  if (drafts.length === 0 || incoming.length === 0) return drafts;

  const storedKeys = new Set<string>();
  const stored = new Map<string, number[]>();

  for (const entry of incoming) {
    const clientMessageId = entry.message.clientMessageId;
    if (clientMessageId) {
      storedKeys.add(clientMessageId);
      continue;
    }

    const id = entry.message.id;
    if (id && known?.has(id)) continue;

    const key = bodyKey(entry);
    const times = stored.get(key);
    if (times) times.push(timeOf(entry));
    else stored.set(key, [timeOf(entry)]);
  }

  return drafts.filter((draft) => {
    if (draft.localId && storedKeys.has(draft.localId)) return false;

    const times = stored.get(bodyKey(draft));
    if (!times) return true;

    const sentAt = timeOf(draft);
    const index = times.findIndex((time) => time >= sentAt - ECHO_SKEW_MS);
    if (index === -1) return true;

    times.splice(index, 1);
    return false;
  });
}

export type HistoryFailure = "older" | "history" | "stale" | "unknown";

export function historyFailure(input: {
  requestedOlder: boolean;
  historyPending: boolean;
  ambiguous?: boolean;
}): HistoryFailure {
  if (input.ambiguous) return "unknown";
  if (input.requestedOlder) return "older";
  return input.historyPending ? "history" : "stale";
}

export function applyHistoryPage(
  entries: ChatEntry[],
  page: HistoryPage,
  options: {
    requestedOlder: boolean;
    cursor: number | null;
    seen?: ReadonlySet<string>;
    removed?: ReadonlySet<string>;
  },
): HistoryMerge {
  const messages = Array.isArray(page?.messages)
    ? (page.messages as IMessage[])
    : [];
  const removed = options.removed;
  const incoming = toChatEntries(messages).filter(
    (entry) => !entry.message.id || !removed?.has(entry.message.id),
  );
  const hasMore = page?.hasMore === true;
  const cursor = toCursor(page?.cursor);

  if (options.requestedOlder && isOlderPage(entries, incoming)) {
    const known = new Set(
      entries.map((entry) => entry.message.id).filter(Boolean),
    );
    const older = incoming.filter(
      (entry) => !entry.message.id || !known.has(entry.message.id),
    );

    return {
      entries: older.length > 0 ? [...older, ...entries] : entries,
      cursor: cursor ?? options.cursor,
      hasMore,
      mode: "prepend",
      added: older.length,
    };
  }

  const seen = knownMessageIds(entries);
  if (options.seen) for (const id of options.seen) seen.add(id);

  const fresher = fresherThanPage(entries, incoming);

  return {
    entries: [
      ...incoming,
      ...fresher,
      ...dropEchoedDrafts(incoming, unsentEntries(entries), seen),
    ],
    cursor,
    hasMore,
    mode: "replace",
    added: incoming.length,
  };
}
