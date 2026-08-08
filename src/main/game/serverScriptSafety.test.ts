import { describe, expect, it } from "vitest";
import {
  assertSafeFileSegment,
  assertSafeRelativePath,
  toArgfilePath,
  toSafeFileName,
  validateServerMemory,
} from "./serverScriptSafety";

describe("toArgfilePath", () => {
  it("converts Windows separators so Java argfiles do not eat them as escapes", () => {
    expect(
      toArgfilePath(
        "libraries\\com\\github\\yushijinhun\\authlib-injector\\1.2.7\\authlib-injector-1.2.7.jar",
      ),
    ).toBe(
      "libraries/com/github/yushijinhun/authlib-injector/1.2.7/authlib-injector-1.2.7.jar",
    );
  });

  it("leaves posix paths untouched", () => {
    expect(toArgfilePath("libraries/com/authlib.jar")).toBe(
      "libraries/com/authlib.jar",
    );
  });
});

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

describe("toSafeFileName", () => {
  it("keeps ordinary mod file names untouched", () => {
    expect(toSafeFileName("Mouse Tweaks-2.25 (1.20.1).jar", "mod file")).toBe(
      "Mouse Tweaks-2.25 (1.20.1).jar",
    );
    expect(toSafeFileName("sodium-fabric-0.5.8+mc1.20.1.jar", "mod file")).toBe(
      "sodium-fabric-0.5.8+mc1.20.1.jar",
    );
  });

  it("strips any directory part so traversal cannot escape the folder", () => {
    expect(
      toSafeFileName(
        String.raw`..\..\..\..\java\jdk-21\bin\javaw.exe`,
        "mod file",
      ),
    ).toBe("javaw.exe");
    expect(toSafeFileName("../../accounts.json", "mod file")).toBe(
      "accounts.json",
    );
    expect(toSafeFileName("mods/nested/x.jar", "mod file")).toBe("x.jar");
  });

  it("rejects names that cannot be used as a file name", () => {
    expect(() => toSafeFileName("", "mod file")).toThrow();
    expect(() => toSafeFileName("..", "mod file")).toThrow();
    expect(() => toSafeFileName("mods/", "mod file")).toThrow();
    expect(() => toSafeFileName("a\0b.jar", "mod file")).toThrow();
    expect(() => toSafeFileName("C:evil.jar", "mod file")).toThrow();
    expect(() => toSafeFileName(undefined as unknown as string, "mod")).toThrow();
  });
});

describe("assertSafeRelativePath", () => {
  it("accepts a normal maven-style library path", () => {
    expect(
      assertSafeRelativePath(
        "com/grubie/authlib/1.0/authlib-1.0.jar",
        "authlib library path",
      ),
    ).toBe("com/grubie/authlib/1.0/authlib-1.0.jar");
  });

  it("normalizes backslashes coming from the backend", () => {
    expect(
      assertSafeRelativePath(String.raw`com\grubie\a.jar`, "path"),
    ).toBe("com/grubie/a.jar");
  });

  it("rejects shell metacharacters that would break out of run.bat", () => {
    expect(() =>
      assertSafeRelativePath('a.jar" & calc & "', "path"),
    ).toThrow();
  });

  it("rejects traversal and absolute paths", () => {
    expect(() => assertSafeRelativePath("../../evil.jar", "path")).toThrow();
    expect(() => assertSafeRelativePath("/etc/passwd", "path")).toThrow();
    expect(() => assertSafeRelativePath("", "path")).toThrow();
  });
});
