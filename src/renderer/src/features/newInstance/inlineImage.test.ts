import { describe, expect, it } from "vitest";
import { parseInlineImage } from "./inlineImage";

describe("parseInlineImage", () => {
  it("reads a png data url", () => {
    expect(parseInlineImage("data:image/png;base64,AAAB")).toEqual({
      extension: "png",
      base64: "AAAB",
    });
  });

  it("normalizes jpeg to jpg", () => {
    expect(parseInlineImage("data:image/jpeg;base64,AAAB")?.extension).toBe(
      "jpg",
    );
    expect(parseInlineImage("data:image/jpg;base64,AAAB")?.extension).toBe(
      "jpg",
    );
  });

  it("keeps webp", () => {
    expect(parseInlineImage("data:image/webp;base64,AAAB")?.extension).toBe(
      "webp",
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(parseInlineImage("  data:image/png;base64,AAAB  ")?.base64).toBe(
      "AAAB",
    );
  });

  it("rejects everything that is not an inline raster image", () => {
    expect(parseInlineImage("")).toBeNull();
    expect(parseInlineImage("file:///C:/logo.png")).toBeNull();
    expect(parseInlineImage("https://example.com/logo.png")).toBeNull();
    expect(parseInlineImage("data:image/svg+xml;base64,AAAB")).toBeNull();
    expect(parseInlineImage("data:image/png,AAAB")).toBeNull();
    expect(parseInlineImage("data:image/png;base64,AA AB")).toBeNull();
  });
});
