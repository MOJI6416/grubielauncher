import { describe, expect, it } from "vitest";
import { normalizeSupportContact, toSupportReplies } from "./supportReplies";

describe("normalizeSupportContact", () => {
  it("keeps one trimmed line", () => {
    expect(normalizeSupportContact("  Discord:\n стив_123\t")).toBe("Discord: стив_123");
  });

  it("caps the length and ignores non-strings", () => {
    expect(normalizeSupportContact("a".repeat(500))).toHaveLength(200);
    expect(normalizeSupportContact(undefined)).toBe("");
    expect(normalizeSupportContact(42)).toBe("");
  });
});

describe("toSupportReplies", () => {
  it("keeps only reports that carry an answer, newest answer first", () => {
    const replies = toSupportReplies({
      items: [
        {
          code: "GRB-AAAA-AAAA",
          instanceName: "Survival",
          createdAt: "2026-11-01T10:00:00.000Z",
          status: "resolved",
          reply: "Update Java",
          repliedAt: "2026-11-02T10:00:00.000Z",
          replySeenAt: "2026-11-02T11:00:00.000Z",
        },
        { code: "GRB-BBBB-BBBB", reply: "", repliedAt: null },
        {
          code: "GRB-CCCC-CCCC",
          createdAt: "2026-11-03T10:00:00.000Z",
          reply: "Remove the duplicate mod",
          repliedAt: "2026-11-04T10:00:00.000Z",
          replySeenAt: null,
        },
      ],
    });

    expect(replies.map((reply) => reply.code)).toEqual([
      "GRB-CCCC-CCCC",
      "GRB-AAAA-AAAA",
    ]);
    expect(replies[0]).toMatchObject({ seen: false, instanceName: "" });
    expect(replies[1]).toMatchObject({ seen: true, instanceName: "Survival" });
  });

  it("survives an answer from an api that does not know the endpoint", () => {
    expect(toSupportReplies(null)).toEqual([]);
    expect(toSupportReplies({ message: "Cannot GET" })).toEqual([]);
    expect(toSupportReplies({ items: [null, 3, "x"] })).toEqual([]);
  });
});
