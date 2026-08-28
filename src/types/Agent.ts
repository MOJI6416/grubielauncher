export type AiProviderProfile = {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyHint: string;
};

export type AiProviderInput = {
  id?: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type AiProvidersState = {
  providers: AiProviderProfile[];
  selectedId: string | null;
};

export type AiModelInfo = {
  id: string;
  label: string;
  supportsTools: boolean;
  contextLength?: number;
};

export type AiProviderTestResult =
  | { ok: true; models: AiModelInfo[] }
  | { ok: false; message: string; code?: string };

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AgentChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: AgentToolCall[];
      reasoningDetails?: unknown[];
    }
  | { role: "tool"; toolCallId: string; content: string };

export type AgentToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentStreamRequest = {
  providerId: string;
  messages: AgentChatMessage[];
  tools?: AgentToolSpec[];
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export type AgentUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
};

export type AgentStreamEvent =
  | { runId: string; type: "text"; delta: string }
  | { runId: string; type: "reasoning"; delta: string }
  | { runId: string; type: "toolCalls"; calls: AgentToolCall[] }
  | { runId: string; type: "reasoningDetails"; details: unknown[] }
  | { runId: string; type: "usage"; usage: AgentUsage }
  | { runId: string; type: "done"; finishReason: string | null }
  | { runId: string; type: "error"; message: string; code?: string };

export type AgentChatSummary = {
  id: string;
  title: string;
  pinned: boolean;
  provider: string | null;
  model: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
};

export type RemoteAiChat = {
  id: string;
  title: string;
  pinned: boolean;
  provider: string | null;
  model: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RemoteAiChatMessage = {
  seq: number;
  role: string;
  content: Record<string, unknown>;
};

export type AgentStoredChat = AgentChatSummary & {
  remoteId: string | null;
  syncedSeq: number;
  messages: unknown[];
  timeline: unknown[];
};

export type AgentSyncPush = {
  id: string;
  remoteId: string | null;
  title: string;
  pinned: boolean;
  provider: string | null;
  model: string | null;
  messages: RemoteAiChatMessage[];
};

export type AgentSyncResult = {
  ok: boolean;
  chats: RemoteAiChat[];
  linked: { id: string; remoteId: string; syncedSeq: number }[];
};

export const AGENT_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const AGENT_MAX_MESSAGES = 400;
export const AGENT_MAX_MESSAGE_CHARS = 200000;
export const AGENT_CHAT_TITLE_MAX = 200;
