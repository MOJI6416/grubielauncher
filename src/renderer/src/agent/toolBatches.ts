import { AgentToolCall } from "@/types/Agent";
import { AgentTool } from "./types";

export const MAX_PARALLEL_READS = 4;

const SEQUENTIAL_TOOLS = new Set(["ask_user", "update_plan"]);

export function runsInParallel(
  call: AgentToolCall,
  tools: Pick<AgentTool, "name" | "risk">[],
): boolean {
  const tool = tools.find((entry) => entry.name === call.name);
  return Boolean(
    tool && tool.risk === "read" && !SEQUENTIAL_TOOLS.has(tool.name),
  );
}

export function planToolBatches(
  calls: AgentToolCall[],
  tools: Pick<AgentTool, "name" | "risk">[],
): AgentToolCall[][] {
  const batches: AgentToolCall[][] = [];

  for (const call of calls) {
    const last = batches[batches.length - 1];

    if (
      last &&
      last.length < MAX_PARALLEL_READS &&
      runsInParallel(call, tools) &&
      runsInParallel(last[0], tools)
    ) {
      last.push(call);
      continue;
    }

    batches.push([call]);
  }

  return batches;
}
