import { describe, expect, it } from "vitest";
import { chatToMarkdown } from "./transcript";
import { TimelineItem } from "./types";

const items: TimelineItem[] = [
  { kind: "user", id: "u1", text: "why did it crash?" },
  {
    kind: "reasoning",
    id: "r1",
    text: "internal chain of thought",
    streaming: false,
  },
  {
    kind: "tool",
    id: "t1",
    callId: "c1",
    name: "get_last_crash",
    label: { key: "agent.tools.getLastCrash" },
    status: "ok",
    input: '{"instance":"Tech"}',
    output: '{"log":"C:/Users/someone/secret"}',
  },
  {
    kind: "assistant",
    id: "a1",
    text: "Sodium is incompatible.",
    streaming: false,
  },
  {
    kind: "permission",
    id: "p1",
    name: "remove_mods",
    risk: "write",
    label: { key: "agent.tools.removeMods" },
    decision: "once",
  },
];

describe("chatToMarkdown", () => {
  it("keeps the conversation and the tool outcomes", () => {
    const md = chatToMarkdown("Assistant", items);

    expect(md).toContain("# Assistant");
    expect(md).toContain("why did it crash?");
    expect(md).toContain("Sodium is incompatible.");
    expect(md).toContain("`get_last_crash` — ok");
    expect(md).toContain("permission `remove_mods`: once");
  });

  it("leaves tool arguments and raw results out", () => {
    const md = chatToMarkdown("Assistant", items);

    expect(md).not.toContain("C:/Users/someone/secret");
    expect(md).not.toContain('{"instance":"Tech"}');
  });

  it("drops reasoning, which is not part of the answer", () => {
    expect(chatToMarkdown("Assistant", items)).not.toContain(
      "internal chain of thought",
    );
  });

  it("renders a plan as a checklist", () => {
    const md = chatToMarkdown("Assistant", [
      {
        kind: "plan",
        id: "pl1",
        steps: [
          { title: "read the log", status: "done" },
          { title: "remove the mod", status: "pending" },
        ],
      },
    ]);

    expect(md).toContain("- [x] read the log");
    expect(md).toContain("- [ ] remove the mod");
  });
});
