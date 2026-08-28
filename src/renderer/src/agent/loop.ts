import {
  AgentChatMessage,
  AgentStreamEvent,
  AgentToolCall,
  AgentUsage,
} from "@/types/Agent";
import {
  abortAgentRun,
  bindRunToCurrentChat,
  MAX_STEPS,
  nextId,
  patchTimelineItem,
  pushTimeline,
  readChat,
  releaseRunOwner,
  updateChat,
} from "./store";
import { buildSystemPrompt } from "./context";
import { buildToolList, findTool, toolSpecs } from "./tools";
import {
  canGrantAlways,
  grantAlways,
  grantScope,
  needsPermission,
} from "./permissions";
import { cancelAllWaiters, STOP_ANSWER, waitForUser } from "./pending";
import { persistCurrentChat, syncChats } from "./history";
import { AgentTool } from "./types";
import { truncate } from "./untrusted";

const api = window.api;

const MAX_TOOL_RESULT_CHARS = 8000;
const STREAM_SETTLE_TIMEOUT_MS = 1500;

function newRunId(): string {
  return `run${Math.random().toString(36).slice(2, 12)}`;
}

const update = updateChat;
const readState = readChat;

function serializeToolResult(result: {
  ok: boolean;
  data?: unknown;
  error?: string;
}): string {
  if (!result.ok) {
    return JSON.stringify({ error: result.error ?? "Tool failed" });
  }

  return truncate(JSON.stringify(result.data ?? null), MAX_TOOL_RESULT_CHARS);
}

function parseToolInput(raw: string): { ok: true; value: any } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

type TurnOutcome = {
  text: string;
  toolCalls: AgentToolCall[];
  reasoningDetails: unknown[];
  finishReason: string | null;
  usage?: AgentUsage;
  error?: { message: string; code?: string };
};

async function streamTurn(
  providerId: string,
  messages: AgentChatMessage[],
  tools: AgentTool[],
  model: string | null,
): Promise<TurnOutcome> {
  const runId = newRunId();
  const assistantId = nextId("assistant");
  const reasoningId = nextId("reasoning");

  let text = "";
  let reasoning = "";
  let hasAssistantItem = false;
  let hasReasoningItem = false;

  const outcome: TurnOutcome = {
    text: "",
    toolCalls: [],
    reasoningDetails: [],
    finishReason: null,
  };

  let settle: (() => void) | null = null;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const handle = (event: AgentStreamEvent) => {
    if (event.runId !== runId) return;

    switch (event.type) {
      case "text": {
        text += event.delta;
        if (!hasAssistantItem) {
          hasAssistantItem = true;
          pushTimeline({
            kind: "assistant",
            id: assistantId,
            text,
            streaming: true,
          });
          return;
        }
        patchTimelineItem(assistantId, (item) =>
          item.kind === "assistant" ? { ...item, text } : item,
        );
        return;
      }
      case "reasoning": {
        reasoning += event.delta;
        if (!hasReasoningItem) {
          hasReasoningItem = true;
          pushTimeline({
            kind: "reasoning",
            id: reasoningId,
            text: reasoning,
            streaming: true,
          });
          return;
        }
        patchTimelineItem(reasoningId, (item) =>
          item.kind === "reasoning" ? { ...item, text: reasoning } : item,
        );
        return;
      }
      case "toolCalls":
        outcome.toolCalls = event.calls;
        return;
      case "reasoningDetails":
        outcome.reasoningDetails = event.details;
        return;
      case "usage":
        outcome.usage = event.usage;
        return;
      case "done":
        outcome.finishReason = event.finishReason;
        settle?.();
        return;
      case "error":
        outcome.error = { message: event.message, code: event.code };
        settle?.();
        return;
    }
  };

  const unsubscribe = api.events.onAgentStream(handle);
  update((state) => ({ ...state, runId }));

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await api.agent.chat.start(runId, {
      providerId,
      messages,
      tools: toolSpecs(tools),
      ...(model ? { model } : {}),
    });

    await Promise.race([
      settled,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, STREAM_SETTLE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    unsubscribe();
    update((state) => ({
      ...state,
      runId: null,
      timeline: state.timeline.map((item) => {
        if (item.id === assistantId && item.kind === "assistant") {
          return { ...item, streaming: false };
        }
        if (item.id === reasoningId && item.kind === "reasoning") {
          return { ...item, streaming: false };
        }
        return item;
      }),
    }));
  }

  outcome.text = text;
  return outcome;
}

function stoppedToolResult(call: AgentToolCall): AgentChatMessage {
  return {
    role: "tool",
    toolCallId: call.id,
    content: JSON.stringify({ error: "The user stopped the run." }),
  };
}

async function runToolCall(
  call: AgentToolCall,
  tools: AgentTool[],
): Promise<AgentChatMessage> {
  const tool = findTool(tools, call.name);
  const itemId = nextId("tool");

  if (!tool) {
    pushTimeline({
      kind: "tool",
      id: itemId,
      callId: call.id,
      name: call.name,
      label: { key: "agent.tools.unknown", params: { name: call.name } },
      status: "error",
      error: `Unknown tool "${call.name}"`,
    });

    return {
      role: "tool",
      toolCallId: call.id,
      content: JSON.stringify({ error: `Unknown tool "${call.name}"` }),
    };
  }

  const parsed = parseToolInput(call.arguments);
  if (!parsed.ok) {
    pushTimeline({
      kind: "tool",
      id: itemId,
      callId: call.id,
      name: call.name,
      label: tool.summarize({}),
      status: "error",
      input: call.arguments,
      error: "Arguments are not valid JSON",
    });

    return {
      role: "tool",
      toolCallId: call.id,
      content: JSON.stringify({
        error: "Arguments were not valid JSON. Send the arguments again.",
      }),
    };
  }

  const label = tool.summarize(parsed.value);

  const scope = grantScope(parsed.value);

  if (needsPermission(tool.name, tool.risk, scope)) {
    const permissionId = nextId("permission");
    const preview = tool.preview
      ? await tool.preview(parsed.value).catch(() => null)
      : null;

    pushTimeline({
      kind: "permission",
      id: permissionId,
      name: tool.name,
      risk: tool.risk,
      label,
      input: call.arguments,
      scope,
      preview,
      decision: null,
    });

    const decision = await waitForUser(permissionId);
    const resolved =
      decision === "once" || decision === "always"
        ? decision
        : decision === STOP_ANSWER
          ? "stopped"
          : "deny";

    patchTimelineItem(permissionId, (item) =>
      item.kind === "permission" ? { ...item, decision: resolved } : item,
    );

    if (resolved === "stopped") {
      return {
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify({
          error: "The user stopped the run before this action started.",
        }),
      };
    }

    if (resolved === "deny") {
      return {
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify({
          error:
            "The user declined this action. Do not retry it. Ask what they would like to do instead.",
        }),
      };
    }

    if (resolved === "always" && canGrantAlways(tool.risk)) {
      grantAlways(tool.name, scope);
    }
  }

  pushTimeline({
    kind: "tool",
    id: itemId,
    callId: call.id,
    name: call.name,
    label,
    status: "running",
    input: call.arguments,
  });

  try {
    const result = await tool.run(parsed.value);
    const content = serializeToolResult(result);

    patchTimelineItem(itemId, (item) =>
      item.kind === "tool"
        ? {
            ...item,
            status: result.ok ? "ok" : "error",
            output: result.ok ? content : undefined,
            error: result.ok ? undefined : result.error,
          }
        : item,
    );

    return { role: "tool", toolCallId: call.id, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    patchTimelineItem(itemId, (item) =>
      item.kind === "tool"
        ? { ...item, status: "error", error: message }
        : item,
    );

    return {
      role: "tool",
      toolCallId: call.id,
      content: JSON.stringify({ error: message }),
    };
  }
}

let activeRun: Promise<void> | null = null;

export function sendAgentMessage(
  providerId: string,
  userText: string,
  model: string | null = null,
): Promise<void> {
  const run = runConversation(providerId, userText, model).finally(() => {
    if (activeRun === run) {
      activeRun = null;
      releaseRunOwner();
    }
  });

  activeRun = run;
  return run;
}

export async function leaveRunningChat(keep: boolean): Promise<void> {
  if (!activeRun || !readState().running) return;

  void abortAgentRun();
  if (keep) await persistCurrentChat();
}

async function runConversation(
  providerId: string,
  userText: string,
  model: string | null,
): Promise<void> {
  const text = userText.trim();
  if (text === "" || readState().running) return;

  const tools = buildToolList();
  const hasSystemPrompt = readState().messages.some(
    (message) => message.role === "system",
  );
  const systemPrompt = hasSystemPrompt ? null : await buildSystemPrompt();

  bindRunToCurrentChat();

  update((state) => ({
    ...state,
    running: true,
    stopping: false,
    steps: 0,
    messages: [
      ...(systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }]
        : []),
      ...state.messages,
      { role: "user" as const, content: text },
    ],
    timeline: [
      ...state.timeline,
      { kind: "user" as const, id: nextId("user"), text },
    ],
  }));

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      update((state) => ({ ...state, steps: step + 1 }));

      const outcome = await streamTurn(
        providerId,
        readState().messages,
        tools,
        model,
      );

      if (outcome.usage) {
        update((state) => ({ ...state, usage: outcome.usage ?? state.usage }));
      }

      const stopped = readState().stopping;

      if (outcome.error && !stopped) {
        pushTimeline({
          kind: "error",
          id: nextId("error"),
          message: outcome.error.message,
          code: outcome.error.code,
        });
        return;
      }

      const assistantMessage: AgentChatMessage = {
        role: "assistant",
        content: outcome.text,
        ...(outcome.toolCalls.length ? { toolCalls: outcome.toolCalls } : {}),
        ...(outcome.reasoningDetails.length
          ? { reasoningDetails: outcome.reasoningDetails }
          : {}),
      };

      if (stopped) {
        if (outcome.text.trim() !== "") {
          update((state) => ({
            ...state,
            messages: [
              ...state.messages,
              { role: "assistant", content: outcome.text },
            ],
          }));
        }
        return;
      }

      update((state) => ({
        ...state,
        messages: [...state.messages, assistantMessage],
      }));

      if (outcome.toolCalls.length === 0) {
        if (outcome.text.trim() === "") {
          const usedToolsBefore = readState().messages.some(
            (message) => message.role === "tool",
          );

          pushTimeline({
            kind: "error",
            id: nextId("error"),
            message: usedToolsBefore
              ? "emptyTurnMidRun"
              : tools.length > 0
                ? "emptyTurnWithTools"
                : "emptyTurn",
            code: outcome.finishReason
              ? `finish_reason=${outcome.finishReason}`
              : undefined,
          });
        }
        return;
      }

      const results: AgentChatMessage[] = [];
      for (const call of outcome.toolCalls) {
        results.push(
          readState().stopping
            ? stoppedToolResult(call)
            : await runToolCall(call, tools),
        );
      }

      update((state) => ({
        ...state,
        messages: [...state.messages, ...results],
      }));

      if (readState().stopping) return;
    }

    pushTimeline({
      kind: "error",
      id: nextId("error"),
      message: "stepLimit",
      code: "AGENT-STEPS",
    });
  } finally {
    cancelAllWaiters();

    if (readState().stopping) {
      pushTimeline({ kind: "stopped", id: nextId("stopped") });
    }

    update((state) => ({
      ...state,
      running: false,
      stopping: false,
      runId: null,
    }));

    await persistCurrentChat();
    void syncChats();
  }
}

export async function retryLastTurn(
  providerId: string,
  model: string | null = null,
): Promise<void> {
  const state = readState();
  if (state.running) return;

  const userIndex = state.messages.findLastIndex(
    (message) => message.role === "user",
  );
  if (userIndex < 0) return;

  const lastUser = state.messages[userIndex];
  if (!("content" in lastUser)) return;

  const timelineIndex = state.timeline.findLastIndex(
    (item) => item.kind === "user" && item.text === lastUser.content,
  );

  update((current) => ({
    ...current,
    messages: current.messages.slice(0, userIndex),
    timeline:
      timelineIndex >= 0
        ? current.timeline.slice(0, timelineIndex)
        : current.timeline,
    planItemId: null,
  }));

  await sendAgentMessage(providerId, lastUser.content, model);
}
