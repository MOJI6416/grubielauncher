import { describe, expect, it } from "vitest";
import { diffBlocks, diffLines, diffStats } from "./diff";

function render(before: string, after: string): string[] {
  return diffLines(before, after).map(
    (line) =>
      `${line.kind === "insert" ? "+" : line.kind === "delete" ? "-" : " "}${line.text}`,
  );
}

describe("diffLines", () => {
  it("returns only equal lines for identical text", () => {
    expect(render("a\nb", "a\nb")).toEqual([" a", " b"]);
  });

  it("finds a changed value in the middle", () => {
    expect(render("a = 1\nb = 2\nc = 3", "a = 1\nb = 5\nc = 3")).toEqual([
      " a = 1",
      "-b = 2",
      "+b = 5",
      " c = 3",
    ]);
  });

  it("handles inserted and removed lines", () => {
    expect(render("a\nb\nc", "a\nx\nc\nd")).toEqual([
      " a",
      "-b",
      "+x",
      " c",
      "+d",
    ]);
    expect(render("", "a\nb")).toEqual(["+a", "+b"]);
    expect(render("a\nb", "")).toEqual(["-a", "-b"]);
  });

  it("numbers lines on both sides", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    expect(lines.map((line) => [line.oldLine, line.newLine])).toEqual([
      [1, 1],
      [2, null],
      [3, 2],
    ]);
  });

  it("treats CRLF and LF as the same lines", () => {
    expect(diffStats(diffLines("a\r\nb", "a\nb"))).toEqual({
      added: 0,
      removed: 0,
    });
  });

  it("keeps working on long files with scattered edits", () => {
    const before = Array.from({ length: 3000 }, (_, i) => `key${i} = ${i}`);
    const after = [...before];
    after[10] = "key10 = changed";
    after[2500] = "key2500 = changed";
    after.splice(1500, 1);

    expect(diffStats(diffLines(before.join("\n"), after.join("\n")))).toEqual({
      added: 2,
      removed: 3,
    });
  });
});

describe("diffBlocks", () => {
  it("collapses long unchanged runs around the edits", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const after = [...before];
    after[10] = "changed";

    const blocks = diffBlocks(
      diffLines(before.join("\n"), after.join("\n")),
      2,
    );

    expect(blocks.map((block) => block.kind)).toEqual([
      "skip",
      "lines",
      "skip",
    ]);
    expect(blocks[0]).toEqual({ kind: "skip", count: 8 });
    expect(blocks[2]).toEqual({ kind: "skip", count: 7 });
  });
});
