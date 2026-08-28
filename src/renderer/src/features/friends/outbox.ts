import { getDefaultStore } from "jotai";
import type { Socket } from "socket.io-client";
import type { IMessage } from "@/types/IMessage";
import { selectedFriendAtom } from "@renderer/stores/atoms";
import {
  chatDraftFriendIds,
  readChatDraft,
  writeChatDraft,
} from "./chatDrafts";
import { toChatEntries, type ChatEntry } from "./chatEntries";
import { CHAT_PAGE_SIZE, dropEchoedDrafts } from "./chatPaging";
import { outgoingRecipient, rememberOutgoing } from "./outgoingSends";

const NEWEST_PAGE_CURSOR = 2_147_483_647;
export const PROBE_TIMEOUT_MS = 15_000;
export const PROBE_ATTEMPTS = 3;
export const RESEND_WINDOW_MS = 12_000;

interface Probe {
  timer: ReturnType<typeof setTimeout>;
  attempt: number;
}

const asked = new Map<string, Probe>();
let session: { socket: Socket; accountKey: string } | null = null;
let resentAt = 0;

export function forgetChatOutbox(): void {
  for (const probe of asked.values()) clearTimeout(probe.timer);
  asked.clear();
  session = null;
  resentAt = 0;
}

export function hasPendingReconcile(): boolean {
  return asked.size > 0;
}

export function hasPendingResend(now: number = Date.now()): boolean {
  return resentAt > 0 && now - resentAt < RESEND_WINDOW_MS;
}

function emitDraft(
  socket: Socket,
  friendId: string,
  entries: ChatEntry[],
): void {
  if (entries.length === 0) return;

  resentAt = Date.now();
  for (const entry of entries) {
    rememberOutgoing(friendId, entry.message.message);
    // Carrying the key is what makes this resend safe: a draft that did reach
    // the server before the socket dropped resolves to the stored message
    // instead of arriving twice.
    socket.emit("sendMessage", {
      message: entry.message,
      recipient: friendId,
      ...(entry.localId ? { clientMessageId: entry.localId } : {}),
    });
  }
}

function stillQueued(accountKey: string, friendId: string): boolean {
  if (getDefaultStore().get(selectedFriendAtom) === friendId) return false;
  return readChatDraft(accountKey, friendId).unsent.length > 0;
}

function askForTail(friendId: string, attempt: number): void {
  const current = session;
  if (!current?.socket.connected) return;

  const timer = setTimeout(() => {
    asked.delete(friendId);
    if (attempt >= PROBE_ATTEMPTS) return;
    if (!stillQueued(current.accountKey, friendId)) return;
    askForTail(friendId, attempt + 1);
  }, PROBE_TIMEOUT_MS);

  asked.set(friendId, { timer, attempt });
  current.socket.emit("getMessages", {
    friendId,
    before: NEWEST_PAGE_CURSOR,
    limit: CHAT_PAGE_SIZE,
  });
}

export function flushChatDrafts(
  socket: Socket,
  accountKey: string | undefined,
  openFriendId?: string,
): number {
  if (!accountKey || !socket.connected) return 0;

  session = { socket, accountKey };
  let requested = 0;

  for (const friendId of chatDraftFriendIds(accountKey)) {
    if (!friendId || friendId === openFriendId) continue;
    if (readChatDraft(accountKey, friendId).unsent.length === 0) continue;

    if (asked.has(friendId)) continue;

    askForTail(friendId, 1);
    requested += 1;
  }

  return requested;
}

export function confirmChatDraft(
  accountKey: string | undefined,
  friendId: string,
  body: IMessage["message"],
  clientMessageId?: string,
): boolean {
  if (!accountKey || !friendId || !body) return false;

  const draft = readChatDraft(accountKey, friendId);
  if (draft.unsent.length === 0) return false;

  const index = clientMessageId
    ? draft.unsent.findIndex((entry) => entry.localId === clientMessageId)
    : draft.unsent.findIndex(
        (entry) =>
          entry.message.message._type === body._type &&
          entry.message.message.value === body.value,
      );
  if (index === -1) return false;

  const unsent = [...draft.unsent];
  unsent.splice(index, 1);

  writeChatDraft(accountKey, friendId, {
    text: draft.text,
    unsent,
    seen: draft.seen,
  });

  return true;
}

function resendReconciledDraft(
  socket: Socket,
  accountKey: string | undefined,
  friendId: string,
  messages: IMessage[],
): void {
  if (!accountKey || !friendId) return;

  const draft = readChatDraft(accountKey, friendId);
  if (draft.unsent.length === 0) return;

  const pending = dropEchoedDrafts(
    toChatEntries(messages),
    draft.unsent,
    new Set(draft.seen),
  );

  if (pending.length !== draft.unsent.length) {
    writeChatDraft(accountKey, friendId, {
      text: draft.text,
      unsent: pending,
      seen: draft.seen,
    });
  }

  if (!socket.connected) return;
  emitDraft(socket, friendId, pending);
}

export function bindChatOutbox(
  socket: Socket,
  accountKey: string | undefined,
): () => void {
  const onEcho = (message: IMessage & { friendId?: string }) => {
    if (!accountKey || message?.sender !== accountKey) return;

    const recipient =
      message.friendId || outgoingRecipient(message.message, message.id);
    if (!recipient) return;

    confirmChatDraft(
      accountKey,
      recipient,
      message.message,
      message.clientMessageId,
    );
  };

  const onHistory = (data: { friendId?: string; messages?: unknown }) => {
    const friendId = typeof data?.friendId === "string" ? data.friendId : "";
    const probe = friendId ? asked.get(friendId) : undefined;
    if (!probe) return;

    clearTimeout(probe.timer);
    asked.delete(friendId);
    if (getDefaultStore().get(selectedFriendAtom) === friendId) return;

    resendReconciledDraft(
      socket,
      accountKey,
      friendId,
      Array.isArray(data?.messages) ? (data.messages as IMessage[]) : [],
    );
  };

  socket.on("sendMessage", onEcho);
  socket.on("getMessages", onHistory);
  socket.on("disconnect", forgetChatOutbox);

  return () => {
    socket.off("sendMessage", onEcho);
    socket.off("getMessages", onHistory);
    socket.off("disconnect", forgetChatOutbox);
    forgetChatOutbox();
  };
}
