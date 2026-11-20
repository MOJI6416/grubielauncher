import { describe, expect, it } from "vitest";
import type { IPackSessionEntry } from "@/types/VersionStatistics";
import {
  PACK_SESSIONS_PER_FLUSH,
  planPackSessionFlush,
} from "./packSessions";

const NOW = Date.parse("2026-11-19T12:00:00Z");

function entry(
  id: string,
  overrides: Partial<IPackSessionEntry> = {},
): IPackSessionEntry {
  return {
    id,
    sub: "me",
    code: "a".repeat(24),
    build: 3,
    seconds: 600,
    crashed: false,
    createdAt: "2026-11-19T10:00:00Z",
    ...overrides,
  };
}

describe("planPackSessionFlush", () => {
  it("sends only the signed-in account's sessions and keeps the others", () => {
    const plan = planPackSessionFlush(
      [entry("1"), entry("2", { sub: "friend" })],
      "me",
      true,
      NOW,
    );
    expect(plan.send.map((item) => item.id)).toEqual(["1"]);
    expect(plan.drop).toEqual([]);
  });

  it("drops sessions older than two weeks or with a broken date", () => {
    const plan = planPackSessionFlush(
      [
        entry("old", { createdAt: "2026-10-01T00:00:00Z" }),
        entry("broken", { createdAt: "yesterday" }),
        entry("fresh"),
      ],
      "me",
      true,
      NOW,
    );
    expect(plan.drop).toEqual(["old", "broken"]);
    expect(plan.send.map((item) => item.id)).toEqual(["fresh"]);
  });

  it("drops everything when the player turned the statistics off", () => {
    const plan = planPackSessionFlush([entry("1"), entry("2")], "me", false, NOW);
    expect(plan.send).toEqual([]);
    expect(plan.drop).toEqual(["1", "2"]);
  });

  it("sends nothing without an account and caps one flush", () => {
    expect(planPackSessionFlush([entry("1")], null, true, NOW).send).toEqual([]);
    const many = Array.from({ length: 30 }, (_, index) => entry(String(index)));
    expect(planPackSessionFlush(many, "me", true, NOW).send).toHaveLength(
      PACK_SESSIONS_PER_FLUSH,
    );
  });
});
