import { describe, expect, it } from "vitest";
import type { AgentChatSummary } from "@/types/Agent";
import { filterChats, groupChats } from "./chatGroups";

const NOW = new Date(2026, 7, 16, 14, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function chat(
  id: string,
  updatedAt: number,
  extra: Partial<AgentChatSummary> = {},
): AgentChatSummary {
  return {
    id,
    title: id,
    pinned: false,
    provider: null,
    model: null,
    messageCount: 2,
    createdAt: updatedAt,
    updatedAt,
    ...extra,
  };
}

describe("groupChats", () => {
  it("splits chats into day buckets in order", () => {
    const buckets = groupChats(
      [
        chat("old", NOW - 30 * DAY),
        chat("today", NOW - 60 * 1000),
        chat("week", NOW - 3 * DAY),
        chat("yesterday", NOW - DAY),
      ],
      NOW,
    );

    expect(buckets.map((bucket) => bucket.id)).toEqual([
      "today",
      "yesterday",
      "week",
      "older",
    ]);
  });

  it("puts pinned chats first regardless of age", () => {
    const buckets = groupChats(
      [chat("fresh", NOW), chat("old", NOW - 40 * DAY, { pinned: true })],
      NOW,
    );

    expect(buckets[0].id).toBe("pinned");
    expect(buckets[0].chats.map((entry) => entry.id)).toEqual(["old"]);
  });

  it("sorts inside a bucket by last update", () => {
    const buckets = groupChats(
      [chat("older", NOW - 4000), chat("newer", NOW - 100)],
      NOW,
    );

    expect(buckets[0].chats.map((entry) => entry.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("uses the calendar day, not 24 hours, for today", () => {
    const justAfterMidnight = new Date(2026, 7, 16, 0, 30, 0).getTime();

    expect(
      groupChats([chat("night", justAfterMidnight)], NOW)[0].id,
    ).toBe("today");
  });

  it("drops empty buckets", () => {
    expect(groupChats([chat("only", NOW)], NOW)).toHaveLength(1);
  });
});

describe("filterChats", () => {
  it("returns everything for an empty query", () => {
    expect(filterChats([chat("a", NOW), chat("b", NOW)], "  ")).toHaveLength(2);
  });

  it("matches the title case-insensitively", () => {
    const list = [chat("Crash in Fabric", NOW), chat("Skins", NOW)];

    expect(filterChats(list, "fabric").map((entry) => entry.id)).toEqual([
      "Crash in Fabric",
    ]);
  });

  it("matches the model a chat ran on", () => {
    const list = [chat("a", NOW, { model: "anthropic/claude" }), chat("b", NOW)];

    expect(filterChats(list, "claude").map((entry) => entry.id)).toEqual(["a"]);
  });
});
