import { describe, expect, it } from "vitest";
import { serverIconDataUrl } from "./serverIcon";

const base64 = "A".repeat(64);

describe("serverIconDataUrl", () => {
  it("keeps a data url as is", () => {
    expect(serverIconDataUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("wraps bare base64 into a png data url", () => {
    expect(serverIconDataUrl(base64)).toBe(`data:image/png;base64,${base64}`);
  });

  it("trims surrounding whitespace", () => {
    expect(serverIconDataUrl(` ${base64} `)).toBe(
      `data:image/png;base64,${base64}`,
    );
  });

  it("drops empty, short and non base64 payloads", () => {
    expect(serverIconDataUrl(undefined)).toBeUndefined();
    expect(serverIconDataUrl("")).toBeUndefined();
    expect(serverIconDataUrl("nope")).toBeUndefined();
    expect(serverIconDataUrl(`${"A".repeat(60)}<script>`)).toBeUndefined();
    expect(serverIconDataUrl("https://example.com/icon.png")).toBeUndefined();
  });
});
