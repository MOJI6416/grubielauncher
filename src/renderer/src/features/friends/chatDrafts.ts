import type { IMessage } from "@/types/IMessage";
import type { ChatEntry } from "./chatEntries";

export interface ChatDraft {
  text: string;
  unsent: ChatEntry[];
  seen: string[];
}

const EMPTY_DRAFT: ChatDraft = { text: "", unsent: [], seen: [] };
const STORAGE_PREFIX = "friends.draft";

export const GROUP_DRAFT_PREFIX = "group:";

export function groupDraftKey(groupId: string): string {
  return `${GROUP_DRAFT_PREFIX}${groupId}`;
}

const drafts = new Map<string, ChatDraft>();

function draftKey(
  accountKey: string | undefined,
  friendId: string | undefined,
): string {
  if (!accountKey || !friendId) return "";
  return `${accountKey}:${friendId}`;
}

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}.${key}`;
}

function toStoredEntry(value: unknown): ChatEntry | null {
  if (!value || typeof value !== "object") return null;

  const entry = value as Partial<ChatEntry>;
  const message = entry.message as IMessage | undefined;
  if (!entry.localId || !message?.message) return null;
  if (typeof message.message.value !== "string") return null;

  return {
    key: entry.key || entry.localId,
    localId: entry.localId,
    status: "failed",
    message: { ...message, time: new Date(message.time) },
  };
}

function toStoredDraft(value: unknown): ChatDraft | null {
  if (!value || typeof value !== "object") return null;

  const draft = value as Partial<ChatDraft>;
  const text = typeof draft.text === "string" ? draft.text : "";
  const unsent = Array.isArray(draft.unsent)
    ? draft.unsent
        .map(toStoredEntry)
        .filter((entry): entry is ChatEntry => entry !== null)
    : [];
  const seen = Array.isArray(draft.seen)
    ? draft.seen.filter((id): id is string => typeof id === "string")
    : [];
  if (!text.trim() && unsent.length === 0) return null;
  return { text, unsent, seen };
}

function loadDraft(key: string): ChatDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? toStoredDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, draft: ChatDraft | null): void {
  try {
    if (draft) localStorage.setItem(storageKey(key), JSON.stringify(draft));
    else localStorage.removeItem(storageKey(key));
  } catch {
    return;
  }
}

export function readChatDraft(
  accountKey: string | undefined,
  friendId: string | undefined,
): ChatDraft {
  const key = draftKey(accountKey, friendId);
  if (!key) return EMPTY_DRAFT;

  const known = drafts.get(key);
  if (known) return known;

  const stored = loadDraft(key);
  if (!stored) return EMPTY_DRAFT;

  drafts.set(key, stored);
  return stored;
}

export function writeChatDraft(
  accountKey: string | undefined,
  friendId: string | undefined,
  draft: ChatDraft,
): void {
  const key = draftKey(accountKey, friendId);
  if (!key) return;

  const unsent = draft.unsent.map((entry) =>
    entry.status === "pending" ? { ...entry, status: "failed" as const } : entry,
  );

  if (!draft.text.trim() && unsent.length === 0) {
    drafts.delete(key);
    saveDraft(key, null);
    return;
  }

  const stored = drafts.get(key);
  const seen = new Set([...(stored?.seen ?? []), ...draft.seen]);

  const next: ChatDraft = {
    text: draft.text,
    unsent,
    seen: unsent.length > 0 ? [...seen] : [],
  };

  drafts.set(key, next);
  saveDraft(key, next);
}

export function chatDraftFriendIds(accountKey: string | undefined): string[] {
  if (!accountKey) return [];

  const prefix = `${STORAGE_PREFIX}.${accountKey}:`;
  const ids = new Set<string>();

  for (const key of drafts.keys()) {
    if (key.startsWith(`${accountKey}:`)) {
      ids.add(key.slice(accountKey.length + 1));
    }
  }

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) ids.add(key.slice(prefix.length));
    }
  } catch {
    return [...ids].filter((id) => !id.startsWith(GROUP_DRAFT_PREFIX));
  }

  return [...ids].filter((id) => !id.startsWith(GROUP_DRAFT_PREFIX));
}

export function forgetChatDrafts(): void {
  drafts.clear();
}
