import { useEffect } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import {
  openGroupChatIdAtom,
  pendingFriendChatAtom,
} from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";

export type ChatTarget =
  | { kind: "friend"; id: string }
  | { kind: "group"; id: string };

interface ChatHandoff {
  key: string;
  files: File[];
}

export const chatHandoffAtom = atom<ChatHandoff | null>(null);

export function chatTargetKey(target: ChatTarget): string {
  return `${target.kind}:${target.id}`;
}

export function handOffToChat(target: ChatTarget, files: File[]) {
  const store = getDefaultStore();
  store.set(chatHandoffAtom, { key: chatTargetKey(target), files });

  if (target.kind === "friend") {
    store.set(openGroupChatIdAtom, null);
    store.set(pendingFriendChatAtom, target.id);
    navigate({ name: "people", section: "friends" });
    return;
  }

  store.set(openGroupChatIdAtom, target.id);
  navigate({ name: "people", section: "groups" });
}

export function useChatHandoff(
  key: string | undefined,
  accept: (files: File[]) => void,
) {
  const handoff = useAtomValue(chatHandoffAtom);

  useEffect(() => {
    if (!key || !handoff || handoff.key !== key) return;
    getDefaultStore().set(chatHandoffAtom, null);
    accept(handoff.files);
  }, [accept, handoff, key]);
}
