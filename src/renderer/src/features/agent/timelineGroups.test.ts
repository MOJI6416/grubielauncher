import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@renderer/agent/types";
import {
  activeToolLabel,
  groupTimeline,
  pendingInteraction,
  planProgress,
  toolGroupStatus,
} from "./timelineGroups";

function tool(
  id: string,
  status: "running" | "ok" | "error" = "ok",
): TimelineItem {
  return {
    kind: "tool",
    id,
    callId: id,
    name: "list_instances",
    label: { key: "agent.tools.listInstances" },
    status,
  };
}

const user: TimelineItem = { kind: "user", id: "u1", text: "hi" };
const assistant: TimelineItem = {
  kind: "assistant",
  id: "a1",
  text: "done",
  streaming: false,
};

describe("groupTimeline", () => {
  it("collapses consecutive tool calls into one block", () => {
    const blocks = groupTimeline([user, tool("t1"), tool("t2"), assistant]);

    expect(blocks.map((block) => block.kind)).toEqual([
      "single",
      "tools",
      "single",
    ]);
    expect(blocks[1].kind === "tools" && blocks[1].items).toHaveLength(2);
  });

  it("starts a new block when something interrupts the tools", () => {
    const blocks = groupTimeline([tool("t1"), assistant, tool("t2")]);

    expect(blocks.map((block) => block.kind)).toEqual([
      "tools",
      "single",
      "tools",
    ]);
  });

  it("keeps the block id stable on the first tool of the group", () => {
    const blocks = groupTimeline([tool("t1"), tool("t2")]);

    expect(blocks[0].id).toBe("t1");
  });

  it("returns nothing for an empty timeline", () => {
    expect(groupTimeline([])).toEqual([]);
  });
});

describe("toolGroupStatus", () => {
  it("reports running while any call is in flight", () => {
    expect(
      toolGroupStatus([
        tool("a", "ok") as never,
        tool("b", "running") as never,
        tool("c", "error") as never,
      ]),
    ).toBe("running");
  });

  it("reports an error when a finished group has a failure", () => {
    expect(
      toolGroupStatus([tool("a", "ok") as never, tool("b", "error") as never]),
    ).toBe("error");
  });

  it("reports ok when everything succeeded", () => {
    expect(toolGroupStatus([tool("a", "ok") as never])).toBe("ok");
  });
});

describe("planProgress", () => {
  it("counts done steps and names the active one", () => {
    expect(
      planProgress([
        { title: "Read the log", status: "done" },
        { title: "Find the mod", status: "active" },
        { title: "Remove it", status: "pending" },
      ]),
    ).toEqual({ done: 1, total: 3, active: "Find the mod" });
  });

  it("handles a plan with nothing active", () => {
    expect(planProgress([{ title: "a", status: "done" }])).toEqual({
      done: 1,
      total: 1,
      active: null,
    });
  });
});

describe("pendingInteraction", () => {
  it("finds an unanswered permission", () => {
    const permission: TimelineItem = {
      kind: "permission",
      id: "p1",
      name: "add_mods",
      risk: "write",
      label: { key: "agent.tools.addMods" },
      decision: null,
    };

    expect(pendingInteraction([user, permission])?.id).toBe("p1");
  });

  it("ignores a permission that was already decided", () => {
    const permission: TimelineItem = {
      kind: "permission",
      id: "p1",
      name: "add_mods",
      risk: "write",
      label: { key: "agent.tools.addMods" },
      decision: "once",
    };

    expect(pendingInteraction([permission])).toBeNull();
  });

  it("finds an unanswered question", () => {
    const question: TimelineItem = {
      kind: "question",
      id: "q1",
      question: "Which instance?",
      options: [],
      multiSelect: false,
      answer: null,
    };

    expect(pendingInteraction([question])?.id).toBe("q1");
  });
});

describe("activeToolLabel", () => {
  it("returns the last running tool", () => {
    expect(
      activeToolLabel([tool("t1", "running"), tool("t2", "running")])?.id,
    ).toBe("t2");
  });

  it("returns nothing when everything finished", () => {
    expect(activeToolLabel([tool("t1", "ok")])).toBeNull();
  });
});
