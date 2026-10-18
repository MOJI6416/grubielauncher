import { AgentChatMessage, AgentUsage } from "@/types/Agent";
import { ILocalProject } from "@/types/ModManager";

export type AgentRisk = "read" | "write" | "destructive";

export type ToolStepLabel = {
  key: string;
  params?: Record<string, unknown>;
};

export type AgentUndo =
  | { op: "mods"; instance: string; put: ILocalProject[]; drop: string[] }
  | { op: "toggle"; instance: string; titles: string[]; enabled: boolean }
  | {
      op: "overrides";
      instance: string;
      values: Partial<
        Record<"xmx" | "optimizedJvm" | "java", unknown | null>
      >;
    }
  | { op: "settings"; values: { xmx?: number; optimizedJvm?: boolean } }
  | {
      op: "runArguments";
      instance: string;
      runArguments: { jvm: string; game: string };
    }
  | { op: "worldName"; instance: string; worldFolder: string; name: string }
  | { op: "skin"; skinId: string }
  | { op: "gameOptions"; instance: string; values: Record<string, string> }
  | {
      op: "configFile";
      instance: string;
      file: string;
      text: string;
      expectHash: string;
    };

export type UndoState = "running" | "done" | "failed";

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  undo?: AgentUndo;
};

export type ToolPreviewRow = {
  key: string;
  value: string;
  from?: string;
  label?: string;
};

export type ToolPreview = {
  rows: ToolPreviewRow[];
  loss?: string;
};

export type AgentTool = {
  name: string;
  risk: AgentRisk;
  description: string;
  parameters: Record<string, unknown>;
  summarize: (input: any) => ToolStepLabel;
  preview?: (input: any) => Promise<ToolPreview | null>;
  run: (input: any) => Promise<ToolResult>;
};

export type PermissionDecision = "once" | "always" | "deny";

export type PermissionOutcome = PermissionDecision | "stopped";

export type PlanStepStatus = "pending" | "active" | "done";

export type PlanStep = {
  title: string;
  status: PlanStepStatus;
};

export type TimelineItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "reasoning"; id: string; text: string; streaming: boolean }
  | {
      kind: "tool";
      id: string;
      callId: string;
      name: string;
      label: ToolStepLabel;
      status: "running" | "ok" | "error";
      input?: string;
      output?: string;
      error?: string;
      undo?: AgentUndo;
      undoState?: UndoState;
      undoError?: string;
    }
  | {
      kind: "permission";
      id: string;
      name: string;
      risk: AgentRisk;
      label: ToolStepLabel;
      input?: string;
      scope?: string | null;
      preview?: ToolPreview | null;
      decision: PermissionOutcome | null;
    }
  | {
      kind: "question";
      id: string;
      question: string;
      options: string[];
      multiSelect: boolean;
      answer: string | null;
    }
  | { kind: "plan"; id: string; steps: PlanStep[] }
  | {
      kind: "compacted";
      id: string;
      upto: number;
      summary: string;
      status: "running" | "done" | "failed";
      tokensBefore: number;
    }
  | { kind: "stopped"; id: string }
  | { kind: "error"; id: string; message: string; code?: string };

export type AgentChatState = {
  messages: AgentChatMessage[];
  timeline: TimelineItem[];
  running: boolean;
  stopping: boolean;
  runId: string | null;
  usage: AgentUsage | null;
  steps: number;
  planItemId: string | null;
};

export const emptyChatState = (): AgentChatState => ({
  messages: [],
  timeline: [],
  running: false,
  stopping: false,
  runId: null,
  usage: null,
  steps: 0,
  planItemId: null,
});
