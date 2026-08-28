import { atom, getDefaultStore } from "jotai";
import { AgentChatSummary, AiModelInfo, AiProvidersState } from "@/types/Agent";
import { stopAllWaiters } from "./pending";
import { AgentChatState, emptyChatState, TimelineItem } from "./types";

export const MAX_STEPS = 24;

export const agentChatAtom = atom<AgentChatState>(emptyChatState());
export const agentProvidersAtom = atom<AiProvidersState | null>(null);
export const agentChatsAtom = atom<AgentChatSummary[]>([]);
export const agentCurrentChatAtom = atom<string | null>(null);
export const agentModelsAtom = atom<Record<string, AiModelInfo[]>>({});
export const agentModelAtom = atom<string | null>(null);

export const agentDraftAtom = atom<string | null>(null);
export const agentSyncFailedAtom = atom(false);

let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readChat(): AgentChatState {
  return getDefaultStore().get(agentChatAtom);
}

let runOwnerChatId: string | null | undefined;

export function bindRunToCurrentChat(): void {
  runOwnerChatId = getDefaultStore().get(agentCurrentChatAtom);
}

export function releaseRunOwner(): void {
  runOwnerChatId = undefined;
}

function runOwnsOpenChat(): boolean {
  return (
    runOwnerChatId === undefined ||
    getDefaultStore().get(agentCurrentChatAtom) === runOwnerChatId
  );
}

export function updateChat(
  patch: (state: AgentChatState) => AgentChatState,
): void {
  if (!runOwnsOpenChat()) return;

  const store = getDefaultStore();
  store.set(agentChatAtom, patch(store.get(agentChatAtom)));
}

export function pushTimeline(item: TimelineItem): void {
  updateChat((state) => ({ ...state, timeline: [...state.timeline, item] }));
}

export function patchTimelineItem(
  id: string,
  patch: (item: TimelineItem) => TimelineItem,
): void {
  updateChat((state) => ({
    ...state,
    timeline: state.timeline.map((item) =>
      item.id === id ? patch(item) : item,
    ),
  }));
}

export async function abortAgentRun(): Promise<void> {
  if (!readChat().running) return;

  updateChat((state) => ({ ...state, stopping: true }));
  stopAllWaiters();

  const runId = readChat().runId;
  if (runId) await window.api.agent.chat.abort(runId);
}
