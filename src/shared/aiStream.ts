import { AgentToolCall, AgentUsage } from "@/types/Agent";

export type SseSplit = {
  lines: string[];
  rest: string;
};

export function splitSseBuffer(buffer: string): SseSplit {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

export function readSsePayload(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith(":")) return null;
  if (!trimmed.startsWith("data:")) return null;
  return trimmed.slice(5).trim();
}

export type ChunkDelta = {
  text?: string;
  reasoning?: string;
  finishReason?: string | null;
  usage?: AgentUsage;
};

export type RawToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

export function extractUsage(raw: any): AgentUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const usage: AgentUsage = {};
  if (typeof raw.prompt_tokens === "number") {
    usage.promptTokens = raw.prompt_tokens;
  }
  if (typeof raw.completion_tokens === "number") {
    usage.completionTokens = raw.completion_tokens;
  }
  if (typeof raw.total_tokens === "number")
    usage.totalTokens = raw.total_tokens;
  if (typeof raw.cost === "number") usage.cost = raw.cost;

  return Object.keys(usage).length > 0 ? usage : undefined;
}

export function extractResponsesUsage(raw: any): AgentUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const usage: AgentUsage = {};
  if (typeof raw.input_tokens === "number") {
    usage.promptTokens = raw.input_tokens;
  }
  if (typeof raw.output_tokens === "number") {
    usage.completionTokens = raw.output_tokens;
  }
  if (typeof raw.total_tokens === "number")
    usage.totalTokens = raw.total_tokens;
  if (typeof raw.cost === "number") usage.cost = raw.cost;

  return Object.keys(usage).length > 0 ? usage : undefined;
}

export function extractChunkDelta(chunk: any): ChunkDelta {
  const result: ChunkDelta = {};
  const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined;
  const delta = choice?.delta;

  if (typeof delta?.content === "string" && delta.content !== "") {
    result.text = delta.content;
  }

  const reasoning =
    typeof delta?.reasoning === "string"
      ? delta.reasoning
      : typeof delta?.reasoning_content === "string"
        ? delta.reasoning_content
        : undefined;
  if (reasoning) result.reasoning = reasoning;

  if (choice && "finish_reason" in choice) {
    result.finishReason = choice.finish_reason ?? null;
  }

  const usage = extractUsage(chunk?.usage);
  if (usage) result.usage = usage;

  return result;
}

export function extractToolCallDeltas(chunk: any): RawToolCallDelta[] {
  const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined;
  const calls = choice?.delta?.tool_calls;
  return Array.isArray(calls) ? calls : [];
}

export function extractReasoningDetails(chunk: any): unknown[] {
  const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined;
  const details = choice?.delta?.reasoning_details;
  return Array.isArray(details) ? details : [];
}

export class ToolCallAccumulator {
  private readonly slots = new Map<
    number,
    { id: string; name: string; args: string }
  >();
  private nextFallbackIndex = 0;

  add(deltas: RawToolCallDelta[]): void {
    for (const delta of deltas) {
      const index =
        typeof delta.index === "number"
          ? delta.index
          : this.nextFallbackIndex++;

      const slot = this.slots.get(index) ?? { id: "", name: "", args: "" };

      if (typeof delta.id === "string" && delta.id !== "") slot.id = delta.id;
      if (
        typeof delta.function?.name === "string" &&
        delta.function.name !== ""
      ) {
        slot.name = delta.function.name;
      }
      if (typeof delta.function?.arguments === "string") {
        slot.args += delta.function.arguments;
      }

      this.slots.set(index, slot);
    }
  }

  get size(): number {
    return this.slots.size;
  }

  result(): AgentToolCall[] {
    return [...this.slots.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, slot]) => ({
        id: slot.id || `call_${index}`,
        name: slot.name,
        arguments: slot.args,
      }))
      .filter((call) => call.name !== "");
  }
}

export class ResponsesToolCallAccumulator {
  private readonly slots = new Map<
    number,
    { id: string; name: string; args: string }
  >();

  add(event: any): void {
    const index =
      typeof event?.output_index === "number" ? event.output_index : 0;
    const item = event?.item;
    const existing = this.slots.get(index) ?? { id: "", name: "", args: "" };

    if (
      (event?.type === "response.output_item.added" ||
        event?.type === "response.output_item.done") &&
      item?.type === "function_call"
    ) {
      if (typeof item.call_id === "string") existing.id = item.call_id;
      if (typeof item.name === "string") existing.name = item.name;
      if (typeof item.arguments === "string") existing.args = item.arguments;
      this.slots.set(index, existing);
      return;
    }

    if (event?.type === "response.function_call_arguments.delta") {
      if (typeof event.delta === "string") existing.args += event.delta;
      this.slots.set(index, existing);
    }
  }

  result(): AgentToolCall[] {
    return [...this.slots.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, slot]) => ({
        id: slot.id || `call_${index}`,
        name: slot.name,
        arguments: slot.args,
      }))
      .filter((call) => call.name !== "");
  }
}

export function describeProviderError(status: number, body: string): string {
  const trimmed = body.trim();
  if (trimmed !== "") {
    try {
      const parsed = JSON.parse(trimmed);
      const message =
        parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? null;
      if (typeof message === "string" && message.trim() !== "") {
        return message.trim().slice(0, 500);
      }
    } catch {
      return trimmed.slice(0, 500);
    }
  }

  return `Provider responded with status ${status}`;
}
