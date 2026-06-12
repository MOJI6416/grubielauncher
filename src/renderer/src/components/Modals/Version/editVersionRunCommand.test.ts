import { describe, expect, it } from "vitest";
import {
  formatRunCommandForClipboard,
  quoteRunCommandArg,
} from "./editVersionRunCommand";

describe("quoteRunCommandArg", () => {
  it("keeps simple args unquoted", () => {
    expect(quoteRunCommandArg("-Xmx4096M")).toBe("-Xmx4096M");
  });

  it("quotes empty args", () => {
    expect(quoteRunCommandArg("")).toBe('""');
  });

  it("quotes args with spaces", () => {
    expect(quoteRunCommandArg("C:\\Program Files\\java.exe")).toBe(
      '"C:\\Program Files\\java.exe"',
    );
  });

  it("escapes embedded quotes", () => {
    expect(quoteRunCommandArg('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("doubles trailing backslashes inside quotes", () => {
    expect(quoteRunCommandArg("path with\\")).toBe('"path with\\\\"');
  });
});

describe("formatRunCommandForClipboard", () => {
  it("joins quoted args with spaces", () => {
    expect(
      formatRunCommandForClipboard(["java", "-cp", "a b.jar", "Main"]),
    ).toBe('java -cp "a b.jar" Main');
  });
});
