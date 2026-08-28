import { IpcMainInvokeEvent } from "electron";
import {
  AGENT_MAX_MESSAGE_CHARS,
  AGENT_MAX_MESSAGES,
  AgentChatMessage,
  AgentStreamEvent,
  AgentChatSummary,
  AgentStoredChat,
  AgentStreamRequest,
  AgentSyncPush,
  AgentSyncResult,
  AgentToolSpec,
  AiModelInfo,
  AiProviderInput,
  AiProviderTestResult,
  AiProvidersState,
  RemoteAiChatMessage,
} from "@/types/Agent";
import {
  deleteProvider,
  listProviders,
  resolveProvider,
  saveProvider,
  selectProvider,
} from "../utilities/aiKeys";
import {
  addTombstone,
  deleteChat,
  forgetTombstone,
  isChatId,
  listChats,
  listTombstones,
  pruneChats,
  readChat,
  writeChat,
} from "../utilities/agentChats";
import { abortRun, listModels, streamChat } from "../services/AiProvider";
import { Backend } from "../services/Backend";
import { check, handleSafe, IpcArgumentError } from "../utilities/ipc";

const isRunId = check.pattern(/^[A-Za-z0-9_-]{1,64}$/, 64);
const reasoningEfforts = new Set([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function emitter(
  event: IpcMainInvokeEvent,
): (payload: AgentStreamEvent) => void {
  return (payload) => {
    if (event.sender.isDestroyed()) return;
    try {
      event.sender.send("agent:stream", payload);
    } catch {}
  };
}

function normalizeMessage(value: any): AgentChatMessage {
  const role = value?.role;
  const content = typeof value?.content === "string" ? value.content : "";

  if (content.length > AGENT_MAX_MESSAGE_CHARS) {
    throw new IpcArgumentError("Agent message is too large");
  }

  if (role === "tool") {
    if (typeof value?.toolCallId !== "string" || value.toolCallId === "") {
      throw new IpcArgumentError("Tool message is missing toolCallId");
    }
    return { role: "tool", toolCallId: value.toolCallId, content };
  }

  if (role === "assistant") {
    const rawCalls = Array.isArray(value?.toolCalls) ? value.toolCalls : [];
    const toolCalls = rawCalls.map((call: any) => {
      if (
        typeof call?.id !== "string" ||
        typeof call?.name !== "string" ||
        typeof call?.arguments !== "string"
      ) {
        throw new IpcArgumentError("Malformed tool call in assistant message");
      }
      return { id: call.id, name: call.name, arguments: call.arguments };
    });

    const reasoningDetails = Array.isArray(value?.reasoningDetails)
      ? value.reasoningDetails.slice(0, 64)
      : undefined;

    return {
      role: "assistant",
      content,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(reasoningDetails?.length ? { reasoningDetails } : {}),
    };
  }

  if (role !== "system" && role !== "user") {
    throw new IpcArgumentError("Unknown agent message role");
  }

  return { role, content };
}

function normalizeTool(value: any): AgentToolSpec {
  if (
    typeof value?.name !== "string" ||
    value.name === "" ||
    typeof value?.description !== "string" ||
    typeof value?.parameters !== "object" ||
    value.parameters === null
  ) {
    throw new IpcArgumentError("Malformed agent tool spec");
  }

  return {
    name: value.name,
    description: value.description,
    parameters: value.parameters,
  };
}

function normalizeRequest(value: any): AgentStreamRequest {
  if (typeof value?.providerId !== "string" || value.providerId === "") {
    throw new IpcArgumentError("Agent request is missing providerId");
  }
  if (!Array.isArray(value?.messages) || value.messages.length === 0) {
    throw new IpcArgumentError("Agent request has no messages");
  }
  if (value.messages.length > AGENT_MAX_MESSAGES) {
    throw new IpcArgumentError("Agent request has too many messages");
  }

  const request: AgentStreamRequest = {
    providerId: value.providerId,
    messages: value.messages.map(normalizeMessage),
  };

  if (Array.isArray(value.tools) && value.tools.length > 0) {
    request.tools = value.tools.map(normalizeTool);
  }
  if (typeof value.reasoningEffort === "string") {
    if (!reasoningEfforts.has(value.reasoningEffort)) {
      throw new IpcArgumentError("Unknown reasoning effort");
    }
    request.reasoningEffort = value.reasoningEffort;
  }
  if (typeof value.temperature === "number") {
    request.temperature = value.temperature;
  }
  if (typeof value.maxTokens === "number") request.maxTokens = value.maxTokens;

  if (typeof value.model === "string" && value.model.trim() !== "") {
    if (value.model.length > 200) {
      throw new IpcArgumentError("Model name is too long");
    }
    request.model = value.model.trim();
  }

  return request;
}

export function registerAgentIpc() {
  handleSafe<AiProvidersState | null>("agent:providers:list", null, () =>
    listProviders(),
  );

  handleSafe<AiProvidersState | null>(
    "agent:providers:save",
    null,
    [check.object()],
    (_, input: AiProviderInput) => saveProvider(input),
  );

  handleSafe<AiProvidersState | null>(
    "agent:providers:delete",
    null,
    [check.nonEmptyString(128)],
    (_, id: string) => deleteProvider(id),
  );

  handleSafe<AiProvidersState | null>(
    "agent:providers:select",
    null,
    [check.nonEmptyString(128)],
    (_, id: string) => selectProvider(id),
  );

  handleSafe<AiProviderTestResult>(
    "agent:providers:test",
    { ok: false, message: "unavailable" },
    [check.object()],
    async (
      _,
      payload: { id?: string; baseUrl?: string; apiKey?: string },
    ): Promise<AiProviderTestResult> => {
      let baseUrl = typeof payload?.baseUrl === "string" ? payload.baseUrl : "";
      let apiKey = typeof payload?.apiKey === "string" ? payload.apiKey : "";

      if (payload?.id) {
        const resolved = await resolveProvider(payload.id);
        if (!resolved) return { ok: false, message: "unknownProvider" };
        if (!baseUrl) baseUrl = resolved.profile.baseUrl;
        if (!apiKey) apiKey = resolved.apiKey;
      }

      if (!baseUrl) return { ok: false, message: "missingBaseUrl" };

      try {
        const models = await listModels(baseUrl.replace(/\/+$/, ""), apiKey);
        return { ok: true, models };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  handleSafe<AiModelInfo[]>(
    "agent:models:list",
    [],
    [check.nonEmptyString(128)],
    async (_, providerId: string) => {
      const resolved = await resolveProvider(providerId);
      if (!resolved) return [];
      return await listModels(resolved.profile.baseUrl, resolved.apiKey);
    },
  );

  handleSafe<boolean>(
    "agent:chat:start",
    false,
    [isRunId, check.object()],
    async (event, runId: string, rawRequest: unknown) => {
      const request = normalizeRequest(rawRequest);
      const emit = emitter(event);

      const resolved = await resolveProvider(request.providerId);
      if (!resolved) {
        emit({
          runId,
          type: "error",
          message: "unknownProvider",
          code: "AI-NOPROVIDER",
        });
        return false;
      }

      if (!resolved.apiKey) {
        emit({
          runId,
          type: "error",
          message: "missingApiKey",
          code: "AI-NOKEY",
        });
        return false;
      }

      await streamChat(
        runId,
        resolved.profile.baseUrl,
        resolved.apiKey,
        request.model || resolved.profile.model,
        request,
        emit,
      );

      return true;
    },
  );

  handleSafe<boolean>(
    "agent:chat:abort",
    false,
    [isRunId],
    (_, runId: string) => abortRun(runId),
  );

  handleSafe<AgentChatSummary[]>("agent:chats:list", [], () => listChats());

  handleSafe<AgentStoredChat | null>(
    "agent:chats:read",
    null,
    [check.nonEmptyString(64)],
    (_, chatId: string) => readChat(chatId),
  );

  handleSafe<boolean>(
    "agent:chats:write",
    false,
    [check.object(64)],
    async (_, chat: AgentStoredChat) => {
      const written = await writeChat(chat);
      if (written) await pruneChats();
      return written;
    },
  );

  handleSafe<boolean>(
    "agent:chats:delete",
    false,
    [check.nonEmptyString(64)],
    async (_, chatId: string) => {
      const stored = await readChat(chatId);
      const removed = await deleteChat(chatId);

      if (removed && stored?.remoteId) await addTombstone(stored.remoteId);

      return removed;
    },
  );

  handleSafe<string[]>("agent:chats:tombstones", [], () => listTombstones());

  handleSafe<boolean>(
    "agent:chats:forgetTombstone",
    false,
    [check.nonEmptyString(64)],
    (_, remoteId: string) => forgetTombstone(remoteId),
  );

  handleSafe<AgentSyncResult>(
    "agent:chats:sync",
    { ok: false, chats: [], linked: [] },
    [check.nonEmptyString(4096), check.arrayOf(check.object(), 200)],
    async (
      _,
      accessToken: string,
      pending: AgentSyncPush[],
    ): Promise<AgentSyncResult> => {
      const backend = new Backend(accessToken);
      const linked: AgentSyncResult["linked"] = [];

      for (const entry of pending) {
        if (!isChatId(entry?.id)) continue;

        const targetId = entry.remoteId
          ? entry.remoteId
          : (
              await backend.createAiChat({
                title: entry.title || "Chat",
                provider: entry.provider ?? undefined,
                model: entry.model ?? undefined,
              })
            )?.id;

        if (!targetId) continue;

        if (entry.remoteId) {
          await backend.updateAiChat(targetId, {
            title: entry.title,
            pinned: entry.pinned,
          });
        }

        let highestSeq = -1;
        if (entry.messages.length > 0) {
          const sent = await backend.appendAiChatMessages(
            targetId,
            entry.messages,
          );
          if (!sent) continue;

          highestSeq = entry.messages.reduce(
            (max, message) => Math.max(max, message.seq),
            -1,
          );
        }

        linked.push({
          id: entry.id,
          remoteId: targetId,
          syncedSeq: highestSeq,
        });
      }

      const chats = await backend.listAiChats();
      return chats
        ? { ok: true, chats, linked }
        : { ok: false, chats: [], linked };
    },
  );

  handleSafe<RemoteAiChatMessage[]>(
    "agent:chats:remoteMessages",
    [],
    [check.nonEmptyString(4096), check.nonEmptyString(64)],
    async (_, accessToken: string, chatId: string) => {
      const backend = new Backend(accessToken);
      return (await backend.getAiChatMessages(chatId)) ?? [];
    },
  );

  handleSafe<boolean>(
    "agent:chats:remoteDelete",
    false,
    [check.nonEmptyString(4096), check.nonEmptyString(64)],
    async (_, accessToken: string, chatId: string) => {
      const backend = new Backend(accessToken);
      return await backend.deleteAiChat(chatId);
    },
  );
}
