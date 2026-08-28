import type { IMessage } from "@/types/IMessage";

export type ChatEntryStatus = "sent" | "pending" | "failed";

export interface ChatEntry {
  key: string;
  message: IMessage;
  localId?: string;
  status: ChatEntryStatus;
}

export function toChatEntries(messages: IMessage[]): ChatEntry[] {
  return messages.map((message, index) => ({
    key:
      message.id ||
      (typeof message.seq === "number"
        ? `seq-${message.seq}`
        : `srv-${index}-${new Date(message.time).getTime()}`),
    message,
    status: "sent",
  }));
}

export function createPendingEntry(
  localId: string,
  message: IMessage,
): ChatEntry {
  return { key: localId, message, localId, status: "pending" };
}

export function appendEntry(entries: ChatEntry[], entry: ChatEntry) {
  return [...entries, entry];
}

export function resolveEcho(
  entries: ChatEntry[],
  message: IMessage,
  ownUserId: string | undefined,
): ChatEntry[] {
  if (message.id && entries.some((entry) => entry.message.id === message.id)) {
    return entries;
  }

  if (ownUserId && message.sender === ownUserId) {
    // The server echoes the key it was sent, so the exact bubble is known.
    // Matching on (type, value) is the fallback for a backend that does not
    // return one yet, and for drafts written before keys existed — it picks
    // the wrong bubble whenever two messages carry the same text.
    const byKey = message.clientMessageId
      ? entries.findIndex(
          (entry) =>
            entry.status !== "sent" &&
            entry.localId === message.clientMessageId,
        )
      : -1;

    const index =
      byKey !== -1
        ? byKey
        : entries.findIndex(
            (entry) =>
              entry.status !== "sent" &&
              entry.message.message._type === message.message._type &&
              entry.message.message.value === message.message.value,
          );

    if (index !== -1) {
      const next = [...entries];
      next[index] = {
        key: message.id || next[index].key,
        message,
        status: "sent",
      };
      return next;
    }
  }

  return appendEntry(entries, {
    key: message.id || `srv-${entries.length}-${new Date(message.time).getTime()}`,
    message,
    status: "sent",
  });
}

export function markEntryFailed(entries: ChatEntry[], localId: string) {
  return entries.map((entry) =>
    entry.localId === localId && entry.status === "pending"
      ? { ...entry, status: "failed" as const }
      : entry,
  );
}

export function markEntryPending(entries: ChatEntry[], localId: string) {
  return entries.map((entry) =>
    entry.localId === localId && entry.status === "failed"
      ? { ...entry, status: "pending" as const }
      : entry,
  );
}

export function dropEntry(entries: ChatEntry[], localId: string) {
  return entries.filter((entry) => entry.localId !== localId);
}

export function removeMessage(entries: ChatEntry[], messageId: string) {
  return entries.filter((entry) => entry.message.id !== messageId);
}

export function applyReactions(
  entries: ChatEntry[],
  messageId: string,
  reactions: IMessage["reactions"],
) {
  return entries.map((entry) =>
    entry.message.id === messageId
      ? { ...entry, message: { ...entry.message, reactions: reactions ?? [] } }
      : entry,
  );
}

export function appendedEntries(
  previous: ChatEntry[],
  next: ChatEntry[],
): ChatEntry[] {
  const previousLast = previous[previous.length - 1]?.key;
  if (!previousLast) return [];

  const index = next.findIndex((entry) => entry.key === previousLast);
  if (index === -1) return [];

  return next.slice(index + 1);
}

export function unsentEntries(entries: ChatEntry[]) {
  return entries.filter((entry) => entry.status !== "sent" && entry.localId);
}

export const QUOTE_LIMIT = 120;

export function quoteMessage(value: string, limit = QUOTE_LIMIT): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return `«${text}»`;
  return `«${text.slice(0, limit).trimEnd()}…»`;
}

export function firstUnreadKey(
  entries: ChatEntry[],
  ownUserId: string | undefined,
  unreadCount: number,
): string | undefined {
  if (unreadCount <= 0) return undefined;

  const incoming = entries.filter(
    (entry) => entry.message.sender !== ownUserId,
  );
  if (incoming.length === 0) return undefined;

  const target = incoming[Math.max(0, incoming.length - unreadCount)];
  return target?.key;
}
