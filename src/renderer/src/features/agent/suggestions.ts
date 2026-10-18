export type AgentSuggestionId =
  | "crashNamed"
  | "updateNamed"
  | "optimizeNamed"
  | "crash"
  | "optimize"
  | "cleanup"
  | "compare";

export type AgentSuggestion = {
  id: AgentSuggestionId;
  name?: string;
};

export type SuggestionContext = {
  crashed: string | null;
  updatable: string | null;
  selected: string | null;
  instanceCount: number;
};

export const MAX_SUGGESTIONS = 4;

export function pickSuggestions(context: SuggestionContext): AgentSuggestion[] {
  const picked: AgentSuggestion[] = [];

  if (context.crashed) picked.push({ id: "crashNamed", name: context.crashed });
  if (context.updatable) {
    picked.push({ id: "updateNamed", name: context.updatable });
  }
  if (context.selected) {
    picked.push({ id: "optimizeNamed", name: context.selected });
  }

  const fallbacks: AgentSuggestionId[] = [
    ...(context.crashed ? [] : (["crash"] as const)),
    ...(context.selected ? [] : (["optimize"] as const)),
    "cleanup",
    ...(context.instanceCount > 1 ? (["compare"] as const) : []),
  ];

  for (const id of fallbacks) picked.push({ id });

  return picked.slice(0, MAX_SUGGESTIONS);
}
