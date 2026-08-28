import {
  AgentChatMessage,
  AgentStreamEvent,
  AgentStreamRequest,
  AgentToolSpec,
  AiModelInfo,
} from "@/types/Agent";
import {
  describeProviderError,
  extractChunkDelta,
  extractReasoningDetails,
  extractResponsesUsage,
  extractToolCallDeltas,
  readSsePayload,
  ResponsesToolCallAccumulator,
  splitSseBuffer,
  ToolCallAccumulator,
} from "@/shared/aiStream";

const MODELS_TIMEOUT_MS = 20000;
const STREAM_IDLE_TIMEOUT_MS = 90000;
const MAX_ERROR_BODY = 4096;

const activeRuns = new Map<string, AbortController>();

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://grubielauncher.com",
    "X-Title": "Grubie Launcher",
  };

  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function toWireMessage(message: AgentChatMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === "assistant") {
    const hasCalls = Boolean(message.toolCalls?.length);
    const wire: Record<string, unknown> = {
      role: "assistant",
      content: hasCalls && message.content === "" ? null : message.content,
    };

    if (hasCalls) {
      wire.tool_calls = message.toolCalls!.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      }));
    }

    if (message.reasoningDetails?.length) {
      wire.reasoning_details = message.reasoningDetails;
    }

    return wire;
  }

  return { role: message.role, content: message.content };
}

function toWireTool(tool: AgentToolSpec): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function toResponsesTool(tool: AgentToolSpec): Record<string, unknown> {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function toResponsesInput(messages: AgentChatMessage[]): unknown[] {
  return messages.flatMap((message) => {
    if (message.role === "tool") {
      return [
        {
          type: "function_call_output",
          call_id: message.toolCallId,
          output: message.content,
        },
      ];
    }

    if (message.role === "assistant") {
      const reasoning = (message.reasoningDetails ?? []).filter(
        (item: any) => item?.type === "reasoning",
      );
      const output: unknown[] = [...reasoning];
      if (message.content !== "") {
        output.push({ role: "assistant", content: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        output.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: call.arguments,
        });
      }
      return output;
    }

    return [{ role: message.role, content: message.content }];
  });
}

export function isGpt56Model(model: string): boolean {
  const id = model.toLowerCase().split("/").pop() ?? "";
  return id === "gpt-5.6" || /^gpt-5\.6[-:]/.test(id);
}

function supportsTools(model: any): boolean {
  const params = model?.supported_parameters;
  if (Array.isArray(params)) {
    if (
      params.includes("tools") ||
      params.includes("tool_choice") ||
      params.includes("functions")
    ) {
      return true;
    }
    return typeof model?.id === "string" && isGpt56Model(model.id);
  }
  return true;
}

function isToolsReasoningCompatibilityError(
  status: number,
  body: string,
): boolean {
  if (status !== 400 && status !== 422) return false;
  const text = body.toLowerCase();
  return (
    /reasoning[_ .]effort/.test(text) &&
    /(tool|function)/.test(text) &&
    /(not supported|unsupported|cannot|incompatible)/.test(text)
  );
}

function buildChatBody(
  model: string,
  request: AgentStreamRequest,
  disableReasoningForTools = false,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    stream: true,
    stream_options: { include_usage: true },
    messages: request.messages.map(toWireMessage),
  };

  if (request.tools?.length) {
    body.tools = request.tools.map(toWireTool);
    body.tool_choice = "auto";
  }
  if (disableReasoningForTools) {
    body.reasoning_effort = "none";
  } else if (request.reasoningEffort) {
    body.reasoning_effort = request.reasoningEffort;
  }
  if (typeof request.temperature === "number") {
    body.temperature = request.temperature;
  }
  if (typeof request.maxTokens === "number") {
    body.max_tokens = request.maxTokens;
  }

  return body;
}

function buildResponsesBody(
  model: string,
  request: AgentStreamRequest,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    stream: true,
    input: toResponsesInput(request.messages),
  };

  if (request.tools?.length) {
    body.tools = request.tools.map(toResponsesTool);
    body.tool_choice = "auto";
  }
  if (request.reasoningEffort) {
    body.reasoning = { effort: request.reasoningEffort };
  }
  if (typeof request.temperature === "number") {
    body.temperature = request.temperature;
  }
  if (typeof request.maxTokens === "number") {
    body.max_output_tokens = request.maxTokens;
  }

  return body;
}

export async function listModels(
  baseUrl: string,
  apiKey: string,
): Promise<AiModelInfo[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: buildHeaders(apiKey),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, MAX_ERROR_BODY);
      throw new Error(describeProviderError(response.status, body));
    }

    const payload = await response.json();
    const list = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];

    return list
      .filter((model: any) => typeof model?.id === "string")
      .map((model: any) => ({
        id: model.id,
        label: typeof model.name === "string" ? model.name : model.id,
        supportsTools: supportsTools(model),
        contextLength:
          typeof model.context_length === "number"
            ? model.context_length
            : undefined,
      }));
  } finally {
    clearTimeout(timer);
  }
}

export function abortRun(runId: string): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;

  controller.abort();
  activeRuns.delete(runId);
  return true;
}

export async function streamChat(
  runId: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  request: AgentStreamRequest,
  emit: (event: AgentStreamEvent) => void,
): Promise<void> {
  abortRun(runId);

  const controller = new AbortController();
  activeRuns.set(runId, controller);

  const accumulator = new ToolCallAccumulator();
  const responsesAccumulator = new ResponsesToolCallAccumulator();
  const reasoningDetails: unknown[] = [];
  let finishReason: string | null = null;
  let timedOut = false;

  let idleTimer: NodeJS.Timeout | undefined;
  const armIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, STREAM_IDLE_TIMEOUT_MS);
  };

  try {
    armIdleTimer();
    const useResponses =
      Boolean(request.tools?.length) || Boolean(request.reasoningEffort);
    let api: "chat" | "responses" = useResponses ? "responses" : "chat";
    let errorBody: string | undefined;
    let response = await fetch(
      `${baseUrl}/${api === "responses" ? "responses" : "chat/completions"}`,
      {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(
          api === "responses"
            ? buildResponsesBody(model, request)
            : buildChatBody(model, request),
        ),
        signal: controller.signal,
      },
    );

    if (
      api === "responses" &&
      [400, 404, 405, 422, 501].includes(response.status)
    ) {
      await response.body?.cancel();
      api = "chat";
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(buildChatBody(model, request)),
        signal: controller.signal,
      });
    }

    if (!response.ok && api === "chat" && request.tools?.length) {
      errorBody = (await response.text()).slice(0, MAX_ERROR_BODY);
      if (isToolsReasoningCompatibilityError(response.status, errorBody)) {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: buildHeaders(apiKey),
          body: JSON.stringify(buildChatBody(model, request, true)),
          signal: controller.signal,
        });
        errorBody = undefined;
      }
    }

    if (!response.ok) {
      const text =
        errorBody ?? (await response.text()).slice(0, MAX_ERROR_BODY);
      emit({
        runId,
        type: "error",
        message: describeProviderError(response.status, text),
        code: `AI-${response.status}`,
      });
      return;
    }

    if (!response.body) {
      emit({
        runId,
        type: "error",
        message: "Provider returned an empty stream",
        code: "AI-EMPTY",
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;

      armIdleTimer();
      buffer += decoder.decode(value, { stream: true });

      const split = splitSseBuffer(buffer);
      buffer = split.rest;

      for (const line of split.lines) {
        const payload = readSsePayload(line);
        if (payload === null) continue;
        if (payload === "[DONE]") {
          finished = true;
          break;
        }

        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        const streamError =
          chunk?.error ??
          (chunk?.type === "response.failed" ? chunk.response?.error : null);
        if (streamError) {
          emit({
            runId,
            type: "error",
            message: describeProviderError(200, JSON.stringify(streamError)),
            code: "AI-STREAM",
          });
          return;
        }

        if (api === "responses") {
          if (
            chunk?.type === "response.output_text.delta" &&
            typeof chunk.delta === "string"
          ) {
            emit({ runId, type: "text", delta: chunk.delta });
          }
          if (
            (chunk?.type === "response.reasoning_text.delta" ||
              chunk?.type === "response.reasoning_summary_text.delta") &&
            typeof chunk.delta === "string"
          ) {
            emit({ runId, type: "reasoning", delta: chunk.delta });
          }
          if (
            chunk?.type === "response.output_item.done" &&
            chunk?.item?.type === "reasoning"
          ) {
            reasoningDetails.push(chunk.item);
          }
          if (chunk?.type === "response.completed") {
            const usage = extractResponsesUsage(chunk.response?.usage);
            if (usage) emit({ runId, type: "usage", usage });
            finishReason =
              chunk.response?.incomplete_details?.reason ??
              chunk.response?.status ??
              "completed";
          }
          responsesAccumulator.add(chunk);
        } else {
          const delta = extractChunkDelta(chunk);
          if (delta.text) emit({ runId, type: "text", delta: delta.text });
          if (delta.reasoning) {
            emit({ runId, type: "reasoning", delta: delta.reasoning });
          }
          if (delta.usage) emit({ runId, type: "usage", usage: delta.usage });
          if (delta.finishReason !== undefined && delta.finishReason !== null) {
            finishReason = delta.finishReason;
          }

          accumulator.add(extractToolCallDeltas(chunk));
          reasoningDetails.push(...extractReasoningDetails(chunk));
        }
      }
    }

    const calls =
      api === "responses"
        ? responsesAccumulator.result()
        : accumulator.result();
    if (calls.length > 0) emit({ runId, type: "toolCalls", calls });

    if (reasoningDetails.length > 0) {
      emit({ runId, type: "reasoningDetails", details: reasoningDetails });
    }

    emit({ runId, type: "done", finishReason });
  } catch (error) {
    if (timedOut) {
      emit({
        runId,
        type: "error",
        message: `The provider sent nothing for ${STREAM_IDLE_TIMEOUT_MS / 1000}s`,
        code: "AI-TIMEOUT",
      });
      return;
    }

    if (controller.signal.aborted) {
      emit({ runId, type: "done", finishReason: "aborted" });
      return;
    }

    emit({
      runId,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      code: "AI-NETWORK",
    });
  } finally {
    clearTimeout(idleTimer);
    if (activeRuns.get(runId) === controller) activeRuns.delete(runId);
  }
}
