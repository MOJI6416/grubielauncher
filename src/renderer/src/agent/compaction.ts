import { AgentChatMessage } from "@/types/Agent";
import { TimelineItem } from "./types";

export const DEFAULT_CONTEXT_TOKENS = 64000;
export const COMPACT_AT = 0.7;
export const KEEP_RECENT = 0.25;
const CHARS_PER_TOKEN = 4;
const MAX_TRANSCRIPT_CHARS = 60000;
const MAX_ARGUMENT_CHARS = 300;
const MAX_TOOL_RESULT_CHARS = 600;

export const COMPACTION_PROMPT =
  "You summarize conversation context for another agent. Do not continue the conversation or answer its questions. Return only a concise checkpoint summary in English: what the user wants, which instances, mods, versions and settings were involved, what was already changed or installed, what failed and why, and what is still open. Keep names, version ids and file names verbatim.";

export const SUMMARY_PREFIX = "[Summary of the earlier part of this chat]\n";

export type Compaction = { upto: number; summary: string };

function messageChars(message: AgentChatMessage): number {
  const content = "content" in message ? (message.content ?? "") : "";
  const calls =
    message.role === "assistant"
      ? (message.toolCalls ?? []).reduce(
          (total, call) => total + call.name.length + call.arguments.length,
          0,
        )
      : 0;

  return content.length + calls;
}

export function estimateTokens(messages: AgentChatMessage[]): number {
  return Math.ceil(
    messages.reduce((total, message) => total + messageChars(message), 0) /
      CHARS_PER_TOKEN,
  );
}

export function activeCompaction(
  timeline: TimelineItem[],
  messages: AgentChatMessage[],
): Compaction | null {
  for (let index = timeline.length - 1; index >= 0; index--) {
    const item = timeline[index];
    if (item.kind !== "compacted" || item.status !== "done") continue;
    if (item.upto >= messages.length) return null;
    if (messages[item.upto]?.role !== "user") return null;
    return { upto: item.upto, summary: item.summary };
  }

  return null;
}

export function wireMessages(
  messages: AgentChatMessage[],
  compaction: Compaction | null,
): AgentChatMessage[] {
  if (!compaction) return messages;

  const system = messages.filter((message) => message.role === "system");

  return [
    ...system,
    { role: "user", content: `${SUMMARY_PREFIX}${compaction.summary}` },
    ...messages
      .slice(compaction.upto)
      .filter((message) => message.role !== "system"),
  ];
}

export function planCompaction(
  messages: AgentChatMessage[],
  compaction: Compaction | null,
  contextTokens: number,
  force = false,
): { from: number; upto: number; tokensBefore: number } | null {
  const wire = wireMessages(messages, compaction);
  const tokensBefore = estimateTokens(wire);

  if (!force && tokensBefore < contextTokens * COMPACT_AT) return null;

  const keep = (force ? tokensBefore : contextTokens) * KEEP_RECENT;
  const from =
    compaction?.upto ??
    Math.max(
      0,
      messages.findIndex((message) => message.role !== "system"),
    );

  let kept = 0;
  let candidate = messages.length;
  for (let index = messages.length - 1; index > from; index--) {
    kept += Math.ceil(messageChars(messages[index]) / CHARS_PER_TOKEN);
    candidate = index;
    if (kept >= keep) break;
  }

  let upto = -1;
  for (let index = candidate; index < messages.length; index++) {
    if (messages[index].role === "user") {
      upto = index;
      break;
    }
  }
  if (upto === -1) {
    for (let index = messages.length - 1; index > from; index--) {
      if (messages[index].role === "user") {
        upto = index;
        break;
      }
    }
  }

  return upto > from ? { from, upto, tokensBefore } : null;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function renderTranscript(
  messages: AgentChatMessage[],
  previousSummary: string | null,
): string {
  const lines: string[] = [];
  if (previousSummary) lines.push(`Earlier summary:\n${previousSummary}`, "");

  for (const message of messages) {
    if (message.role === "system") continue;

    if (message.role === "user") {
      lines.push(`User: ${message.content}`);
      continue;
    }

    if (message.role === "assistant") {
      if (message.content.trim() !== "") {
        lines.push(`Assistant: ${message.content}`);
      }
      for (const call of message.toolCalls ?? []) {
        lines.push(
          `Assistant called ${call.name} ${clip(call.arguments, MAX_ARGUMENT_CHARS)}`,
        );
      }
      continue;
    }

    lines.push(`Tool result: ${clip(message.content, MAX_TOOL_RESULT_CHARS)}`);
  }

  const text = lines.join("\n");
  return text.length <= MAX_TRANSCRIPT_CHARS
    ? text
    : `…\n${text.slice(text.length - MAX_TRANSCRIPT_CHARS)}`;
}
