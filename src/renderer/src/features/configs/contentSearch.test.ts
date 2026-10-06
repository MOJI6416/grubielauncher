import { describe, expect, it } from "vitest";
import { findLineMatches, findRanges, searchFiles } from "./contentSearch";

describe("findRanges", () => {
  it("finds every case-insensitive occurrence", () => {
    expect(
      findRanges("renderDistance = 8\nRENDERDISTANCE", "renderdistance"),
    ).toEqual([
      { from: 0, to: 14 },
      { from: 19, to: 33 },
    ]);
    expect(findRanges("abc", "")).toEqual([]);
  });
});

describe("findLineMatches", () => {
  it("reports one row per line with a trimmed preview", () => {
    const text = "[client]\n\tdistance = 16 # distance distance\n\tother = 1\n";
    const result = findLineMatches(text, "distance");

    expect(result.total).toBe(3);
    expect(result.matches).toEqual([
      {
        line: 1,
        column: 1,
        length: 8,
        preview: "distance = 16 # distance distance",
        previewColumn: 0,
      },
    ]);
  });

  it("shortens long lines around the match", () => {
    const line = `${"a".repeat(100)}needle${"b".repeat(100)}`;
    const [match] = findLineMatches(line, "needle").matches;

    expect(match.preview.startsWith("…")).toBe(true);
    expect(match.preview.endsWith("…")).toBe(true);
    expect(
      match.preview.slice(match.previewColumn, match.previewColumn + 6),
    ).toBe("needle");
  });
});

describe("searchFiles", () => {
  it("skips files without matches and very short queries", () => {
    const files = [
      { relative: "a.toml", text: "speed = 1" },
      { relative: "b.toml", text: "nothing" },
    ];

    expect(searchFiles(files, "speed").map((file) => file.relative)).toEqual([
      "a.toml",
    ]);
    expect(searchFiles(files, "s")).toEqual([]);
  });
});
