import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as unknown as { window: unknown }).window = { api: {} };
});

import { selectMissingRemoteChats, timelineFromMessages } from "./history";

const remote = (id: string) => ({
  id,
  title: "chat",
  pinned: false,
  provider: null,
  model: null,
  messageCount: 1,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
});

describe("selectMissingRemoteChats", () => {
  it("skips a chat that is already linked locally", () => {
    expect(
      selectMissingRemoteChats([remote("r1")], [{ remoteId: "r1" }]),
    ).toEqual([]);
  });

  it("pulls a chat that exists only upstream", () => {
    const missing = selectMissingRemoteChats(
      [remote("r1"), remote("r2")],
      [{ remoteId: "r1" }],
    );

    expect(missing.map((chat) => chat.id)).toEqual(["r2"]);
  });

  it("treats a never-synced local chat as no claim on any remote id", () => {
    expect(
      selectMissingRemoteChats([remote("r1")], [{ remoteId: null }]).map(
        (chat) => chat.id,
      ),
    ).toEqual(["r1"]);
  });

  it("pulls everything when nothing is stored yet", () => {
    expect(
      selectMissingRemoteChats([remote("r1"), remote("r2")], []),
    ).toHaveLength(2);
  });
});

describe("timelineFromMessages", () => {
  const call = {
    id: "call-1",
    name: "set_run_arguments",
    arguments: '{"instance":"Fresh Pack"}',
  };

  it("labels a restored tool step with a key the locales actually have", () => {
    const [step] = timelineFromMessages([
      { role: "assistant", content: "", toolCalls: [call] },
    ] as never);

    expect(step).toMatchObject({
      kind: "tool",
      label: { key: "agent.toolNames.set_run_arguments" },
    });
  });

  it("does not restore a failed tool step as a success", () => {
    const [step] = timelineFromMessages([
      { role: "assistant", content: "", toolCalls: [call] },
      {
        role: "tool",
        toolCallId: "call-1",
        content: '{"error":"No instance named \\"Fresh Pack\\""}',
      },
    ] as never);

    expect(step).toMatchObject({ kind: "tool", status: "error" });
  });

  it("keeps a tool step that answered without an error as done", () => {
    const [step] = timelineFromMessages([
      { role: "assistant", content: "", toolCalls: [call] },
      { role: "tool", toolCallId: "call-1", content: '{"applied":true}' },
    ] as never);

    expect(step).toMatchObject({ kind: "tool", status: "ok" });
  });
});
