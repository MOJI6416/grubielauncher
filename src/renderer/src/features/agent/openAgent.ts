import { getDefaultStore } from "jotai";
import { agentDraftAtom } from "@renderer/agent/store";
import { navigate } from "@renderer/navigation/navigate";
import { pendingNavigationAtom } from "@renderer/navigation/store";
import { countFeature } from "@renderer/features/usage/usage";

export function openAgent(): boolean {
  return navigate({ name: "agent" });
}

export function askAgent(draft?: string): boolean {
  countFeature("agent.ask");
  const store = getDefaultStore();
  const previous = store.get(agentDraftAtom);

  store.set(agentDraftAtom, draft?.trim() || "");

  if (navigate({ name: "agent" })) return true;
  if (store.get(pendingNavigationAtom)) return false;

  store.set(agentDraftAtom, previous);
  return false;
}
