import { describe, expect, it } from "vitest";
import {
  assertSafeFileSegment,
  validateServerMemory,
} from "./serverScriptSafety";

describe("validateServerMemory", () => {
  it("accepts positive integers and floors them", () => {
    expect(validateServerMemory(2048)).toBe(2048);
    expect(validateServerMemory("4096")).toBe(4096);
    expect(validateServerMemory(1024.7)).toBe(1024);
  });

  it("rejects non-positive, non-numeric and injection strings", () => {
    expect(() => validateServerMemory(0)).toThrow();
    expect(() => validateServerMemory(-1)).toThrow();
    expect(() => validateServerMemory("1 & calc.exe & ")).toThrow();
    expect(() => validateServerMemory("abc")).toThrow();
    expect(() => validateServerMemory(NaN)).toThrow();
    expect(() => validateServerMemory(undefined)).toThrow();
  });
});

describe("assertSafeFileSegment", () => {
  it("accepts plausible cores, version ids and jar names", () => {
    expect(assertSafeFileSegment("vanilla", "core")).toBe("vanilla");
    expect(assertSafeFileSegment("1.20.1", "version")).toBe("1.20.1");
    expect(
      assertSafeFileSegment("forge-1.20.1-47.2.0-universal.jar", "jar"),
    ).toBe("forge-1.20.1-47.2.0-universal.jar");
  });

  it("rejects shell metacharacters, separators and empties", () => {
    expect(() => assertSafeFileSegment("vanilla.jar & calc", "jar")).toThrow();
    expect(() => assertSafeFileSegment("../evil", "version")).toThrow();
    expect(() => assertSafeFileSegment("a/b", "core")).toThrow();
    expect(() => assertSafeFileSegment("", "core")).toThrow();
    expect(() => assertSafeFileSegment("$(rm -rf /)", "core")).toThrow();
  });
});
