import { describe, expect, it } from "vitest";
import {
  markSupportReplySeen,
  mergeSupportReply,
  toLiveSupportReply,
} from "./supportReport";

const reply = (code: string, seen = false) => ({
  code,
  instanceName: "",
  createdAt: "2026-11-19T10:00:00.000Z",
  reply: `answer for ${code}`,
  repliedAt: "2026-11-19T10:00:00.000Z",
  seen,
});

describe("support replies in the renderer", () => {
  it("reads a live answer from the socket and refuses anything else", () => {
    expect(
      toLiveSupportReply({
        code: "GRB-AAAA-AAAA",
        reply: "Update Java",
        repliedAt: "2026-11-19T10:00:00.000Z",
      }),
    ).toMatchObject({ code: "GRB-AAAA-AAAA", seen: false });
    expect(toLiveSupportReply({ code: "GRB-AAAA-AAAA", reply: "" })).toBeNull();
    expect(toLiveSupportReply("GRB-AAAA-AAAA")).toBeNull();
  });

  it("puts a new answer first and replaces an older one for the same report", () => {
    const merged = mergeSupportReply(
      [reply("GRB-AAAA-AAAA", true), reply("GRB-BBBB-BBBB", true)],
      reply("GRB-BBBB-BBBB"),
    );
    expect(merged.map((item) => [item.code, item.seen])).toEqual([
      ["GRB-BBBB-BBBB", false],
      ["GRB-AAAA-AAAA", true],
    ]);
  });

  it("marks one answer seen and leaves an empty list alone", () => {
    expect(
      markSupportReplySeen([reply("GRB-AAAA-AAAA")], "GRB-AAAA-AAAA")?.[0].seen,
    ).toBe(true);
    expect(markSupportReplySeen(null, "GRB-AAAA-AAAA")).toBeNull();
  });
});
