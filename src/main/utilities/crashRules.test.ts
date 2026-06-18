import { describe, expect, it } from "vitest";
import {
  extractCrashSignature,
  matchCrashRules,
  sanitizeCrashRules,
} from "./crashRules";

describe("matchCrashRules", () => {
  it("detects out of memory", () => {
    const match = matchCrashRules(
      "Caused by: java.lang.OutOfMemoryError: Java heap space",
    );
    expect(match?.ruleId).toBe("out_of_memory");
  });

  it("detects a missing fabric dependency with the culprit mod", () => {
    const match = matchCrashRules(
      "Mod 'Sodium Extra' (sodium-extra) 0.5.4 requires any version of sodium, which is missing!",
    );
    expect(match?.ruleId).toBe("fabric_missing_dep");
    expect(match?.culprits).toContain("Sodium Extra");
  });

  it("detects a corrupted jar and names the broken file", () => {
    const match = matchCrashRules(
      "Error: Invalid or corrupt jarfile C:\\Users\\me\\.grubielauncher\\mods\\sodium-fabric-0.5.8.jar",
    );
    expect(match?.ruleId).toBe("corrupted_files");
    expect(match?.culprits).toContain("sodium-fabric-0.5.8.jar");
  });

  it("still detects a missing class as corrupted files", () => {
    expect(
      matchCrashRules("java.lang.NoClassDefFoundError: net/foo/Bar")?.ruleId,
    ).toBe("corrupted_files");
  });

  it("detects incompatible mods with the culprit mod", () => {
    const match = matchCrashRules(
      "net.fabricmc.loader.impl.discovery.ModResolutionException: Mod 'Some Mod' (somemod) is incompatible with mod 'Other'",
    );
    expect(match?.ruleId).toBe("mod_resolution");
    expect(match?.culprits).toContain("Some Mod");
  });

  it("detects mixin failures with the culprit mod", () => {
    const match = matchCrashRules(
      "org.spongepowered.asm.mixin.throwables.MixinApplyError: Mixin [iris.mixins.json] from mod iris failed",
    );
    expect(match?.ruleId).toBe("mixin_error");
    expect(match?.culprits).toContain("iris");
  });

  it("detects graphics driver problems", () => {
    const match = matchCrashRules(
      "GLFW error 65542: WGL: The driver does not appear to support OpenGL",
    );
    expect(match?.ruleId).toBe("gl_error");
  });

  it("detects ticking entity crashes with the entity type", () => {
    const match = matchCrashRules(
      "Description: Ticking entity\n...\nEntity Type: alexsmobs:grizzly_bear (net.alexsmobs.GrizzlyBear)",
    );
    expect(match?.ruleId).toBe("ticking_entity");
    expect(match?.culprits).toContain("alexsmobs:grizzly_bear");
  });

  it("prefers the OptiFine rule over the generic mixin rule", () => {
    const match = matchCrashRules(
      "Loaded mods: OptiFine_1.20.1_HD_U\norg.spongepowered.asm.mixin.throwables.MixinApplyError: Mixin apply for mod sodium failed",
    );
    expect(match?.ruleId).toBe("optifine_conflict");
  });

  it("detects stack overflow loops", () => {
    expect(matchCrashRules("java.lang.StackOverflowError: null")?.ruleId).toBe(
      "stack_overflow",
    );
  });

  it("detects expired sessions", () => {
    expect(
      matchCrashRules("Disconnected: Invalid session (Try restarting)")?.ruleId,
    ).toBe("auth_invalid_session");
  });

  it("matches native crashes by exit code when there is no report text", () => {
    const match = matchCrashRules("", undefined, -1073740791);
    expect(match?.ruleId).toBe("native_crash");
  });

  it("returns null for unknown crashes", () => {
    expect(matchCrashRules("some perfectly normal log output")).toBeNull();
    expect(matchCrashRules("", undefined, 1)).toBeNull();
  });

  it("prefers earlier (more specific) rules", () => {
    const match = matchCrashRules(
      "java.lang.OutOfMemoryError while loading class java.lang.ClassNotFoundException",
    );
    expect(match?.ruleId).toBe("out_of_memory");
  });
});

describe("extractCrashSignature", () => {
  it("captures the crash description and exception line", () => {
    const signature = extractCrashSignature(
      "Time: 2026-06-17\nDescription: Exception in server tick loop\n\njava.lang.NullPointerException: Cannot invoke method\n\tat net.foo.Bar.tick(Bar.java:42)",
    );
    expect(signature).toContain("Exception in server tick loop");
    expect(signature).toContain("java.lang.NullPointerException");
  });

  it("strips file paths and the OS username", () => {
    const signature = extractCrashSignature(
      "Error: Invalid or corrupt jarfile C:\\Users\\John\\.grubielauncher\\mods\\sodium.jar",
    );
    expect(signature).not.toContain("John");
    expect(signature).not.toContain("Users");
    expect(signature).toContain("sodium.jar");
  });

  it("falls back to the exit code when there is no log text", () => {
    expect(extractCrashSignature("", 134)).toBe("exit code 134");
  });

  it("returns an empty string when there is nothing to fingerprint", () => {
    expect(extractCrashSignature("")).toBe("");
  });
});

describe("sanitizeCrashRules", () => {
  it("drops malformed rules and broken regexes", () => {
    const rules = sanitizeCrashRules([
      { id: "ok", pattern: "abc", messages: { en: "e", ru: "r", uk: "u" } },
      { id: "broken-regex", pattern: "([", messages: { en: "e", ru: "r", uk: "u" } },
      { id: "no-messages", pattern: "abc" },
      "garbage",
    ]);

    expect(rules.map((rule) => rule.id)).toEqual(["ok"]);
  });

  it("returns empty array for non-arrays", () => {
    expect(sanitizeCrashRules({ not: "array" })).toEqual([]);
  });
});
