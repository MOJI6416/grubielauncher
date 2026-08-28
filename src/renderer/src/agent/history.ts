import { getDefaultStore } from "jotai";
import {
  AGENT_CHAT_TITLE_MAX,
  AgentChatMessage,
  AgentStoredChat,
  AgentSyncPush,
  RemoteAiChat,
  RemoteAiChatMessage,
} from "@/types/Agent";
import {
  accountAtom,
  networkAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import {
  agentChatsAtom,
  agentChatAtom,
  agentCurrentChatAtom,
  agentModelAtom,
  agentProvidersAtom,
  agentSyncFailedAtom,
  nextId,
  readChat,
} from "./store";
import { AgentChatState, emptyChatState, TimelineItem } from "./types";

const api = window.api;

function accessToken(): string | null {
  return getDefaultStore().get(accountAtom)?.accessToken ?? null;
}

function syncEnabled(): boolean {
  return getDefaultStore().get(settingsAtom).agentChatSync;
}

function canSync(): boolean {
  const store = getDefaultStore();
  return Boolean(accessToken()) && store.get(networkAtom) && syncEnabled();
}

export function deriveTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, AGENT_CHAT_TITLE_MAX);
}

function currentChatId(): string | null {
  return getDefaultStore().get(agentCurrentChatAtom);
}

function toRemoteMessages(
  messages: AgentChatMessage[],
  fromSeq: number,
): RemoteAiChatMessage[] {
  return messages
    .map((message, seq) => ({ message, seq }))
    .filter((entry) => entry.seq > fromSeq && entry.message.role !== "system")
    .map((entry) => ({
      seq: entry.seq,
      role: entry.message.role,
      content: entry.message as unknown as Record<string, unknown>,
    }));
}

function toolFailure(messages: AgentChatMessage[], callId: string): string | null {
  const answer = messages.find(
    (message) => message.role === "tool" && message.toolCallId === callId,
  );
  if (!answer || !("content" in answer)) return null;

  try {
    const parsed = JSON.parse(answer.content);
    const error = parsed?.error;
    return typeof error === "string" && error !== "" ? error : null;
  } catch {
    return null;
  }
}

export function timelineFromMessages(messages: AgentChatMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      items.push({ kind: "user", id: nextId("user"), text: message.content });
      continue;
    }

    if (message.role === "assistant") {
      if (message.content.trim() !== "") {
        items.push({
          kind: "assistant",
          id: nextId("assistant"),
          text: message.content,
          streaming: false,
        });
      }

      for (const call of message.toolCalls ?? []) {
        const failure = toolFailure(messages, call.id);

        items.push({
          kind: "tool",
          id: nextId("tool"),
          callId: call.id,
          name: call.name,
          label: { key: `agent.toolNames.${call.name}` },
          status: failure ? "error" : "ok",
          input: call.arguments,
          ...(failure ? { error: failure } : {}),
        });
      }
    }
  }

  return items;
}

export function startNewChat(): string {
  const id = nextId("chat");
  const store = getDefaultStore();

  store.set(agentChatAtom, emptyChatState());
  store.set(agentCurrentChatAtom, id);

  return id;
}

export async function refreshChats(): Promise<void> {
  getDefaultStore().set(agentChatsAtom, await api.agent.chats.list());
}

export async function persistCurrentChat(): Promise<void> {
  const id = currentChatId();
  if (!id) return;

  const state = readChat();
  if (state.messages.length === 0) return;

  const stored = await api.agent.chats.read(id);
  const firstUser = state.messages.find((message) => message.role === "user");
  const fallbackTitle =
    firstUser && "content" in firstUser ? deriveTitle(firstUser.content) : "";

  const store = getDefaultStore();
  const providers = store.get(agentProvidersAtom);
  const activeProvider = providers?.providers.find(
    (provider) => provider.id === providers.selectedId,
  );

  const chat: AgentStoredChat = {
    id,
    title: stored?.title || fallbackTitle || "…",
    pinned: stored?.pinned ?? false,
    provider: stored?.provider ?? activeProvider?.label ?? null,
    model:
      stored?.model ??
      store.get(agentModelAtom) ??
      activeProvider?.model ??
      null,
    messageCount: state.messages.length,
    createdAt: stored?.createdAt || Date.now(),
    updatedAt: Date.now(),
    remoteId: stored?.remoteId ?? null,
    syncedSeq: stored?.syncedSeq ?? -1,
    messages: state.messages,
    timeline: state.timeline,
  };

  await api.agent.chats.write(chat);
  await refreshChats();
}

export async function openChat(chatId: string): Promise<void> {
  const stored = await api.agent.chats.read(chatId);
  const store = getDefaultStore();

  store.set(agentCurrentChatAtom, chatId);
  store.set(agentChatAtom, {
    ...emptyChatState(),
    messages: (stored?.messages ?? []) as AgentChatState["messages"],
    timeline: (stored?.timeline ?? []) as TimelineItem[],
  });
}

async function patchChat(
  chatId: string,
  patch: Partial<AgentStoredChat>,
): Promise<void> {
  const stored = await api.agent.chats.read(chatId);
  if (!stored) return;

  await api.agent.chats.write({ ...stored, ...patch, updatedAt: Date.now() });
  await refreshChats();
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  const clean = deriveTitle(title);
  if (clean === "") return;

  await patchChat(chatId, { title: clean });
}

export async function togglePinned(chatId: string): Promise<void> {
  const stored = await api.agent.chats.read(chatId);
  if (!stored) return;

  await patchChat(chatId, { pinned: !stored.pinned });
}

export async function deleteChat(chatId: string): Promise<void> {
  const stored = await api.agent.chats.read(chatId);
  const token = accessToken();

  await api.agent.chats.remove(chatId);

  if (stored?.remoteId && token && canSync()) {
    const removed = await api.agent.chats.remoteRemove(token, stored.remoteId);
    if (removed) await api.agent.chats.forgetTombstone(stored.remoteId);
  }

  if (currentChatId() === chatId) {
    const store = getDefaultStore();
    store.set(agentChatAtom, emptyChatState());
    store.set(agentCurrentChatAtom, null);
  }

  await refreshChats();
}

let syncInFlight: Promise<void> | null = null;

export function syncChats(): Promise<void> {
  if (!syncInFlight) {
    syncInFlight = runSync().finally(() => {
      syncInFlight = null;
    });
  }

  return syncInFlight;
}

async function runSync(): Promise<void> {
  if (!syncEnabled()) {
    getDefaultStore().set(agentSyncFailedAtom, false);
    return;
  }

  const token = accessToken();
  if (!token || !canSync()) return;

  const summaries = getDefaultStore().get(agentChatsAtom);
  const pending: AgentSyncPush[] = [];
  const stored = new Map<string, AgentStoredChat>();

  for (const summary of summaries) {
    const chat = await api.agent.chats.read(summary.id);
    if (!chat) continue;

    stored.set(chat.id, chat);

    const messages = toRemoteMessages(
      chat.messages as AgentChatMessage[],
      chat.syncedSeq,
    );

    if (messages.length === 0 && chat.remoteId) continue;

    pending.push({
      id: chat.id,
      remoteId: chat.remoteId,
      title: chat.title,
      pinned: chat.pinned,
      provider: chat.provider,
      model: chat.model,
      messages,
    });
  }

  const store = getDefaultStore();
  const result = await api.agent.chats.sync(token, pending);

  if (!result?.ok) {
    store.set(agentSyncFailedAtom, true);
    return;
  }

  store.set(agentSyncFailedAtom, false);

  const tombstones = new Set(await dropRemoteTombstones(token));

  for (const link of result.linked) {
    const chat = stored.get(link.id);
    if (!chat) continue;

    const linked: AgentStoredChat = {
      ...chat,
      remoteId: link.remoteId,
      syncedSeq: Math.max(chat.syncedSeq, link.syncedSeq),
    };

    await api.agent.chats.write(linked);
    stored.set(link.id, linked);
  }

  await pullMissingChats(
    token,
    result.chats.filter((remote) => !tombstones.has(remote.id)),
    stored,
  );
  await refreshChats();
}

async function dropRemoteTombstones(token: string): Promise<string[]> {
  const pending = await api.agent.chats.tombstones();

  for (const remoteId of pending) {
    const removed = await api.agent.chats.remoteRemove(token, remoteId);
    if (removed) await api.agent.chats.forgetTombstone(remoteId);
  }

  return pending;
}

export function selectMissingRemoteChats(
  remoteChats: RemoteAiChat[],
  stored: Iterable<Pick<AgentStoredChat, "remoteId">>,
): RemoteAiChat[] {
  const known = new Set<string>();
  for (const chat of stored) {
    if (chat.remoteId) known.add(chat.remoteId);
  }

  return remoteChats.filter((remote) => !known.has(remote.id));
}

async function pullMissingChats(
  token: string,
  remoteChats: RemoteAiChat[],
  stored: Map<string, AgentStoredChat>,
): Promise<void> {
  for (const remote of selectMissingRemoteChats(remoteChats, stored.values())) {
    const rows = await api.agent.chats.remoteMessages(token, remote.id);
    if (rows.length === 0) continue;

    const messages = rows
      .sort((a, b) => a.seq - b.seq)
      .map((row) => row.content as unknown as AgentChatMessage);

    const createdAt = Date.parse(remote.createdAt) || Date.now();
    const updatedAt = Date.parse(remote.updatedAt) || createdAt;

    await api.agent.chats.write({
      id: nextId("chat"),
      title: remote.title,
      pinned: remote.pinned,
      provider: remote.provider,
      model: remote.model,
      messageCount: messages.length,
      createdAt,
      updatedAt,
      remoteId: remote.id,
      syncedSeq: rows[rows.length - 1].seq,
      messages,
      timeline: timelineFromMessages(messages),
    });
  }
}
