import { describe, expect, it } from "vitest";
import { buildLines, lineOfOffset, lineRange, lineStartOffsets } from "./lines";
import { tokenizeConfig } from "./highlight";

function plain(lines: ReturnType<typeof buildLines>) {
  return lines.map((line) =>
    line
      .map((segment) =>
        segment.caret ? "|" : segment.tone ? `[${segment.text}]` : segment.text,
      )
      .join(""),
  );
}

describe("buildLines", () => {
  const text = "#Comment\nkey = 16\n\nlast = true";
  const tokens = tokenizeConfig(text, "toml");

  it("splits tokens into lines and keeps empty lines", () => {
    expect(plain(buildLines(tokens, [], null))).toEqual([
      "#Comment",
      "key = 16",
      "",
      "last = true",
    ]);
  });

  it("marks highlights, even across token borders", () => {
    const lines = buildLines(
      tokens,
      [
        { from: 9, to: 12, tone: "match" },
        { from: 14, to: 17, tone: "active" },
      ],
      null,
    );
    expect(plain(lines)[1]).toBe("[key] =[ 16]");
    expect(lines[1].find((segment) => segment.text === " 16")?.tone).toBe(
      "active",
    );
  });

  it("places the caret marker at the right offset", () => {
    expect(plain(buildLines(tokens, [], 12))[1]).toBe("key| = 16");
    expect(plain(buildLines(tokens, [], 0))[0]).toBe("|#Comment");
    expect(plain(buildLines(tokens, [], text.length))[3]).toBe("last = true|");
    expect(plain(buildLines(tokens, [], 18))[2]).toBe("|");
  });

  it("adds a final empty line after a trailing newline", () => {
    expect(
      plain(buildLines(tokenizeConfig("a = 1\n", "toml"), [], null)),
    ).toEqual(["a = 1", ""]);
  });
});

describe("line offsets", () => {
  it("maps offsets to lines and back", () => {
    const text = "a\nbb\n\nccc";
    const starts = lineStartOffsets(text);
    expect(starts).toEqual([0, 2, 5, 6]);
    expect(lineOfOffset(starts, 3)).toBe(1);
    expect(lineOfOffset(starts, 6)).toBe(3);
    expect(lineRange(text, starts, 1)).toEqual({ from: 2, to: 4 });
    expect(lineRange(text, starts, 3)).toEqual({ from: 6, to: 9 });
  });
});
