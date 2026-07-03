import { describe, expect, it } from "vitest";
import { assertSafeVersionName, isSafeVersionName } from "./versionName";

describe("isSafeVersionName", () => {
  it("accepts normal version names (dots inside are fine)", () => {
    expect(isSafeVersionName("Fabulously Optimized")).toBe(true);
    expect(isSafeVersionName("1.20.1")).toBe(true);
    expect(isSafeVersionName("my..pack")).toBe(true);
  });

  it("rejects traversal, separators, reserved chars, overlong and empty", () => {
    expect(isSafeVersionName(".")).toBe(false);
    expect(isSafeVersionName("..")).toBe(false);
    expect(isSafeVersionName("...")).toBe(false);
    expect(isSafeVersionName("a/b")).toBe(false);
    expect(isSafeVersionName("a\\b")).toBe(false);
    expect(isSafeVersionName("a\0b")).toBe(false);
    expect(isSafeVersionName("")).toBe(false);
    expect(isSafeVersionName("   ")).toBe(false);
    expect(isSafeVersionName("a".repeat(33))).toBe(false);
    expect(isSafeVersionName(42 as unknown as string)).toBe(false);
  });

  it("rejects Windows reserved names and trailing dot/space", () => {
    expect(isSafeVersionName("CON")).toBe(false);
    expect(isSafeVersionName("con")).toBe(false);
    expect(isSafeVersionName("NUL.txt")).toBe(false);
    expect(isSafeVersionName("COM1")).toBe(false);
    expect(isSafeVersionName("LPT9")).toBe(false);
    expect(isSafeVersionName("pack.")).toBe(false);
    expect(isSafeVersionName("pack .")).toBe(false);
    expect(isSafeVersionName("console")).toBe(true);
    expect(isSafeVersionName("COM10")).toBe(true);
  });
});

describe("assertSafeVersionName", () => {
  it("throws on unsafe names and returns the trimmed name on safe ones", () => {
    expect(() => assertSafeVersionName("..")).toThrow();
    expect(() => assertSafeVersionName("a/b")).toThrow();
    expect(assertSafeVersionName("  pack ")).toBe("pack");
  });
});
