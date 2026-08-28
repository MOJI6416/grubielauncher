import type { IMessage, MessageBodyType } from "@/types/IMessage";
import type { UnreadCounts } from "./unread";

export interface ChatPreview {
  id: string;
  seq: number | null;
  senderId: string;
  type: MessageBodyType;
  value: string;
  time: string | null;
}

export interface ChatSummary {
  peerId: string;
  unread: number;
  lastSeq: number;
  lastReadSeq: number;
  peerReadSeq: number;
  peerReadAt: string | null;
  lastMessage: ChatPreview | null;
}

export type ChatPreviews = Record<string, ChatPreview>;

const PREVIEW_TYPES: MessageBodyType[] = [
  "text",
  "image",
  "modpack",
  "groupInvite",
  "system",
];

const PREVIEW_LABEL_KEYS: Partial<Record<MessageBodyType, string>> = {
  image: "friends.chatImage",
  modpack: "friends.chatAttachModpack",
  groupInvite: "friends.chatGroupInvite",
};

function toCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

function toTime(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function toPreviewType(value: unknown): MessageBodyType {
  return PREVIEW_TYPES.includes(value as MessageBodyType)
    ? (value as MessageBodyType)
    : "text";
}

export function normalizePreview(value: unknown): ChatPreview | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const senderId = typeof raw.senderId === "string" ? raw.senderId : "";
  if (!senderId) return null;

  const seq = Number(raw.seq);

  return {
    id: typeof raw.id === "string" ? raw.id : "",
    seq: Number.isFinite(seq) ? Math.trunc(seq) : null,
    senderId,
    type: toPreviewType(raw.type),
    value: typeof raw.value === "string" ? raw.value : "",
    time: toTime(raw.time),
  };
}

export function normalizeChatsSummary(payload: unknown): ChatSummary[] {
  const chats = (payload as { chats?: unknown } | null)?.chats;
  if (!Array.isArray(chats)) return [];

  const summaries: ChatSummary[] = [];

  for (const item of chats) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const peerId = typeof raw.peerId === "string" ? raw.peerId : "";
    if (!peerId) continue;

    summaries.push({
      peerId,
      unread: toCount(raw.unread),
      lastSeq: toCount(raw.lastSeq),
      lastReadSeq: toCount(raw.lastReadSeq),
      peerReadSeq: toCount(raw.peerReadSeq),
      peerReadAt: toTime(raw.peerReadAt),
      lastMessage: normalizePreview(raw.lastMessage),
    });
  }

  return summaries;
}

export interface ChatsSummaryState {
  previews: ChatPreviews;
  unread: UnreadCounts;
}

function isAheadOfSummary(
  preview: ChatPreview | undefined,
  lastSeq: number,
): boolean {
  return preview !== undefined && preview.seq !== null && preview.seq > lastSeq;
}

export function applyChatsSummary(
  summaries: ChatSummary[],
  known: ChatsSummaryState,
): ChatsSummaryState {
  const previews: ChatPreviews = {};
  const unread: UnreadCounts = {};
  const named = new Set<string>();

  for (const summary of summaries) {
    named.add(summary.peerId);

    const seen = known.previews[summary.peerId];
    const isAhead = isAheadOfSummary(seen, summary.lastSeq);
    const preview = isAhead ? seen : summary.lastMessage;
    if (preview) previews[summary.peerId] = preview;

    const count = isAhead
      ? Math.max(summary.unread, known.unread[summary.peerId] || 0)
      : summary.unread;
    if (count > 0) unread[summary.peerId] = count;
  }

  for (const [peerId, preview] of Object.entries(known.previews)) {
    if (named.has(peerId)) continue;
    previews[peerId] = preview;
    const count = known.unread[peerId] || 0;
    if (count > 0) unread[peerId] = count;
  }

  return { previews, unread };
}

export function previewFromMessage(message: IMessage): ChatPreview | null {
  if (!message?.sender || !message.message) return null;

  const seq = Number(message.seq);

  return {
    id: message.id || "",
    seq: Number.isFinite(seq) ? Math.trunc(seq) : null,
    senderId: message.sender,
    type: toPreviewType(message.message._type),
    value: message.message._type === "text" ? message.message.value : "",
    time: toTime(message.time) ?? new Date().toISOString(),
  };
}

export function setPreview(
  previews: ChatPreviews,
  peerId: string,
  preview: ChatPreview | null,
): ChatPreviews {
  if (!peerId || !preview) return previews;

  const current = previews[peerId];
  if (
    current &&
    current.seq !== null &&
    preview.seq !== null &&
    preview.seq <= current.seq
  ) {
    return previews;
  }

  return { ...previews, [peerId]: preview };
}

export function previewOfMessage(
  previews: ChatPreviews,
  messageId: string,
): string | null {
  if (!messageId) return null;

  for (const [peerId, preview] of Object.entries(previews)) {
    if (preview.id === messageId) return peerId;
  }

  return null;
}

export function dropPreviewMessage(
  previews: ChatPreviews,
  messageId: string,
): ChatPreviews {
  const peerId = previewOfMessage(previews, messageId);
  if (!peerId) return previews;

  const next = { ...previews };
  delete next[peerId];
  return next;
}

export function dropPreviews(
  previews: ChatPreviews,
  knownIds: Iterable<string>,
): ChatPreviews {
  const known = new Set(knownIds);
  const next: ChatPreviews = {};
  let changed = false;

  for (const [id, preview] of Object.entries(previews)) {
    if (known.has(id)) next[id] = preview;
    else changed = true;
  }

  return changed ? next : previews;
}

export interface PreviewDescriptor {
  isOwn: boolean;
  type: MessageBodyType;
  text: string;
  labelKey: string;
}

export function describePreview(
  preview: ChatPreview | null | undefined,
  ownUserId?: string,
): PreviewDescriptor | null {
  if (!preview || preview.type === "system") return null;

  const labelKey = PREVIEW_LABEL_KEYS[preview.type] ?? "";
  const text = labelKey ? "" : preview.value.replace(/\s+/g, " ").trim();
  if (!labelKey && !text) return null;

  return {
    isOwn: Boolean(ownUserId) && preview.senderId === ownUserId,
    type: preview.type,
    text,
    labelKey,
  };
}
