import { describe, expect, it } from "vitest";
import { MAX_REPLIES, splitReplies } from "./replies";

describe("splitReplies", () => {
  it("takes the replies line off the answer", () => {
    expect(
      splitReplies("Sodium crashed it.\n\n[[replies: Turn Sodium off | Show the log]]"),
    ).toEqual({
      text: "Sodium crashed it.",
      replies: ["Turn Sodium off", "Show the log"],
    });
  });

  it("is lenient about spacing and case", () => {
    expect(splitReplies("Done.\n  [[ Replies :a|  b |]]  ").replies).toEqual([
      "a",
      "b",
    ]);
  });

  it("keeps at most three and drops overly long ones", () => {
    const long = "x".repeat(81);
    const { replies } = splitReplies(`Ok\n[[replies: a | ${long} | b | c | d]]`);

    expect(replies).toEqual(["a", "b", "c"]);
    expect(replies.length).toBeLessThanOrEqual(MAX_REPLIES);
  });

  it("leaves an answer without the line untouched", () => {
    expect(splitReplies("See [the docs](https://x.y) for more.")).toEqual({
      text: "See [the docs](https://x.y) for more.",
      replies: [],
    });
  });

  it("hides a half-streamed replies line", () => {
    expect(splitReplies("Done.\n[[repl", true).text).toBe("Done.");
    expect(splitReplies("Done.\n[", true).text).toBe("Done.");
  });

  it("does not hide an open markdown link while streaming", () => {
    expect(splitReplies("See [the do", true).text).toBe("See [the do");
  });

  it("ignores the marker when it is not the last line", () => {
    const text = "[[replies: a | b]]\nMore text";
    expect(splitReplies(text)).toEqual({ text, replies: [] });
  });
});
