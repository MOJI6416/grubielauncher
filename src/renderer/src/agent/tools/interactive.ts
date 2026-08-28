import { waitForUser } from "../pending";
import {
  nextId,
  patchTimelineItem,
  pushTimeline,
  readChat,
  updateChat,
} from "../store";
import { AgentTool, PlanStep, PlanStepStatus } from "../types";

const MAX_OPTIONS = 6;
const MAX_PLAN_STEPS = 12;

const PLAN_STATUSES: PlanStepStatus[] = ["pending", "active", "done"];

function normalizeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item !== "")
    .slice(0, MAX_OPTIONS);
}

function normalizeSteps(value: unknown): PlanStep[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (step) => step && typeof step.title === "string" && step.title !== "",
    )
    .slice(0, MAX_PLAN_STEPS)
    .map((step) => ({
      title: String(step.title),
      status: PLAN_STATUSES.includes(step.status) ? step.status : "pending",
    }));
}

export const askUser: AgentTool = {
  name: "ask_user",
  risk: "read",
  description:
    'Ask the user a clarifying question and wait for their answer. Call this BEFORE any other tool when the request does not say which instance, which mod or which Minecraft version it means — for example "install a mod for me" or "fix my build". Do not resolve the ambiguity yourself by listing instances and picking one. Offer concrete options when you can; the user can also type a free answer.',
  parameters: {
    type: "object",
    properties: {
      question: { type: "string" },
      options: {
        type: "array",
        items: { type: "string" },
        description: "Up to 6 concrete choices shown as buttons",
      },
      multiSelect: {
        type: "boolean",
        description: "Allow picking several options at once",
      },
    },
    required: ["question"],
  },
  summarize: () => ({ key: "agent.tools.askUser" }),
  run: async (input) => {
    const question = String(input?.question ?? "").trim();
    if (question === "") return { ok: false, error: "question is required" };

    const id = nextId("question");

    pushTimeline({
      kind: "question",
      id,
      question,
      options: normalizeOptions(input?.options),
      multiSelect: input?.multiSelect === true,
      answer: null,
    });

    const answer = await waitForUser(id);

    if (answer === null) {
      patchTimelineItem(id, (item) =>
        item.kind === "question" ? { ...item, answer: "" } : item,
      );
      return {
        ok: false,
        error: "The user did not answer and stopped the run",
      };
    }

    patchTimelineItem(id, (item) =>
      item.kind === "question" ? { ...item, answer } : item,
    );

    return { ok: true, data: { answer } };
  },
};

export const updatePlan: AgentTool = {
  name: "update_plan",
  risk: "read",
  description:
    "Show or update a checklist of the steps you are going to take, so the user can follow along. Call it once at the start of any task that needs more than two or three tool calls, then call it again to mark steps done as you go. Keep the same step titles between calls.",
  parameters: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            status: { type: "string", enum: PLAN_STATUSES },
          },
          required: ["title", "status"],
        },
      },
    },
    required: ["steps"],
  },
  summarize: () => ({ key: "agent.tools.updatePlan" }),
  run: async (input) => {
    const steps = normalizeSteps(input?.steps);
    if (steps.length === 0) return { ok: false, error: "steps is required" };

    const existingId = readChat().planItemId;

    if (existingId) {
      patchTimelineItem(existingId, (item) =>
        item.kind === "plan" ? { ...item, steps } : item,
      );
    } else {
      const id = nextId("plan");
      pushTimeline({ kind: "plan", id, steps });
      updateChat((state) => ({ ...state, planItemId: id }));
    }

    return { ok: true, data: { steps: steps.length } };
  },
};
