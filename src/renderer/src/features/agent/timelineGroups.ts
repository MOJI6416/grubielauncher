import type { PlanStep, TimelineItem } from "@renderer/agent/types";

export type ToolItem = Extract<TimelineItem, { kind: "tool" }>;

export type TimelineBlock =
  | { kind: "single"; id: string; item: TimelineItem }
  | { kind: "tools"; id: string; items: ToolItem[] };

export type ToolGroupStatus = "running" | "ok" | "error";

export function groupTimeline(
  items: readonly TimelineItem[],
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  for (const item of items) {
    const last = blocks[blocks.length - 1];

    if (item.kind === "tool") {
      if (last && last.kind === "tools") {
        last.items.push(item);
        continue;
      }

      blocks.push({ kind: "tools", id: item.id, items: [item] });
      continue;
    }

    blocks.push({ kind: "single", id: item.id, item });
  }

  return blocks;
}

export function toolGroupStatus(items: readonly ToolItem[]): ToolGroupStatus {
  if (items.some((item) => item.status === "running")) return "running";
  if (items.some((item) => item.status === "error")) return "error";

  return "ok";
}

export function planProgress(steps: readonly PlanStep[]): {
  done: number;
  total: number;
  active: string | null;
} {
  const done = steps.filter((step) => step.status === "done").length;
  const active = steps.find((step) => step.status === "active");

  return { done, total: steps.length, active: active?.title ?? null };
}

export function pendingInteraction(
  items: readonly TimelineItem[],
): TimelineItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item.kind === "permission" && item.decision === null) return item;
    if (item.kind === "question" && item.answer === null) return item;
  }

  return null;
}

export function activeToolLabel(
  items: readonly TimelineItem[],
): ToolItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "tool" && item.status === "running") return item;
  }

  return null;
}
