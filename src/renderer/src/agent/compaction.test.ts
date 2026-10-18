import { describe, expect, it } from "vitest";
import { AgentChatMessage } from "@/types/Agent";
import {
  activeCompaction,
  planCompaction,
  renderTranscript,
  SUMMARY_PREFIX,
  wireMessages,
} from "./compaction";

const big = "x".repeat(4000);

function chat(turns: number): AgentChatMessage[] {
  const messages: AgentChatMessage[] = [{ role: "system", content: "rules" }];
  for (let turn = 0; turn < turns; turn++) {
    messages.push({ role: "user", content: `question ${turn}` });
    messages.push({
      role: "assistant",
      content: "",
      toolCalls: [{ id: `c${turn}`, name: "get_instance", arguments: "{}" }],
    });
    messages.push({ role: "tool", toolCallId: `c${turn}`, content: big });
    messages.push({ role: "assistant", content: `answer ${turn}` });
  }
  return messages;
}

describe("planCompaction", () => {
  it("leaves a short chat alone", () => {
    expect(planCompaction(chat(2), null, 64000)).toBeNull();
  });

  it("cuts a long chat at a user message and keeps the recent part", () => {
    const messages = chat(20);
    const plan = planCompaction(messages, null, 20000);

    expect(plan).not.toBeNull();
    expect(plan!.from).toBe(1);
    expect(messages[plan!.upto].role).toBe("user");
    expect(plan!.upto).toBeLessThan(messages.length - 1);
  });

  it("cannot cut inside the only turn", () => {
    expect(planCompaction(chat(1), null, 1000)).toBeNull();
  });

  it("compacts on demand even below the threshold", () => {
    const plan = planCompaction(chat(3), null, 1_000_000, true);
    expect(plan).not.toBeNull();
  });
});

describe("wireMessages", () => {
  it("sends the summary in place of the old part and keeps the system prompt", () => {
    const messages = chat(3);
    const wire = wireMessages(messages, { upto: 9, summary: "they asked" });

    expect(wire[0]).toEqual({ role: "system", content: "rules" });
    expect(wire[1]).toEqual({ role: "user", content: `${SUMMARY_PREFIX}they asked` });
    expect(wire.slice(2)).toEqual(messages.slice(9));
  });
});

describe("activeCompaction", () => {
  it("ignores a summary that no longer lines up with the messages", () => {
    const messages = chat(2);
    const item = {
      kind: "compacted" as const,
      id: "c",
      upto: 2,
      summary: "s",
      status: "done" as const,
      tokensBefore: 1,
    };

    expect(activeCompaction([item], messages)).toBeNull();
    expect(activeCompaction([{ ...item, upto: 5 }], messages)).toEqual({
      upto: 5,
      summary: "s",
    });
    expect(
      activeCompaction([{ ...item, upto: 5, status: "failed" }], messages),
    ).toBeNull();
  });
});

describe("renderTranscript", () => {
  it("carries the earlier summary and clips long tool output", () => {
    const text = renderTranscript(chat(1), "before");

    expect(text.startsWith("Earlier summary:\nbefore")).toBe(true);
    expect(text).toContain("User: question 0");
    expect(text).toContain("Assistant called get_instance {}");
    expect(text.length).toBeLessThan(1000);
  });
});
