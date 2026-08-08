import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CRASH_RULES,
  crashPatternKey,
  crashRuleCulpritPattern,
  crashRulePatterns,
  DEFAULT_CRASH_RULE_PRIORITY,
  describeUnsafePattern,
  extractCrashSignature,
  matchCrashRules,
  sanitizeCrashRules,
  selectCrashRule,
} from "./crashRules";

const MAX_PATTERN_LENGTH = 500;

describe("running the patterns somewhere else", () => {
  const rules = [
    {
      id: "one",
      priority: 10,
      pattern: "boom",
      culpritPattern: "Mod '([^']+)'",
      messages: { en: "e", ru: "r", uk: "u" },
    },
    {
      id: "two",
      priority: 20,
      allPatterns: ["boom", "crash"],
      flags: "",
      messages: { en: "e", ru: "r", uk: "u" },
    },
    {
      id: "three",
      priority: 30,
      exitCodes: [-1073741819],
      messages: { en: "e", ru: "r", uk: "u" },
    },
  ];

  it("hands out every pattern once, with the flags it runs under", () => {
    expect(crashRulePatterns(rules)).toEqual([
      { pattern: "boom", flags: "i" },
      { pattern: "boom", flags: "" },
      { pattern: "crash", flags: "" },
    ]);
  });

  it("keeps the culprit pattern apart, with its own flags", () => {
    expect(crashRuleCulpritPattern(rules[0])).toEqual({
      pattern: "Mod '([^']+)'",
      flags: "gi",
    });
    expect(crashRuleCulpritPattern(rules[1])).toBeNull();
  });

  it("picks the same rule from verdicts as it does from the text", () => {
    const verdicts = new Map([
      [crashPatternKey("boom", "i"), true],
      [crashPatternKey("boom", ""), true],
      [crashPatternKey("crash", ""), false],
    ]);

    const chosen = selectCrashRule(rules, (pattern, flags) =>
      verdicts.get(crashPatternKey(pattern, flags)) === true,
    );
    expect(chosen?.id).toBe("one");
    expect(matchCrashRules("boom", rules)?.ruleId).toBe("one");
  });

  it("still answers on the exit code when no pattern ran", () => {
    const chosen = selectCrashRule(rules, () => false, -1073741819);
    expect(chosen?.id).toBe("three");
  });
});

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

  it("prefers the specific duplicate rule over the generic mixin rule", () => {
    const match = matchCrashRules(
      "MixinApplyError: Mixin apply for mod jei failed\nFound duplicate mods:\n\tMod ID: 'jei'",
    );
    expect(match?.ruleId).toBe("duplicate_mods");
  });

  it("does not let a generic remote rule shadow a specific built-in one", () => {
    const remote = sanitizeCrashRules([
      {
        id: "remote_generic",
        pattern: "Exception",
        messages: { en: "e", ru: "r", uk: "u" },
      },
    ]);

    const match = matchCrashRules(
      "DuplicateModsFoundException: Found duplicate mods",
      [...remote, ...BUILT_IN_CRASH_RULES],
    );
    expect(match?.ruleId).toBe("duplicate_mods");
  });

  it("lets a remote rule win when it declares a higher priority", () => {
    const remote = sanitizeCrashRules([
      {
        id: "remote_specific",
        pattern: "Found duplicate mods",
        priority: 500,
        messages: { en: "e", ru: "r", uk: "u" },
      },
    ]);

    const match = matchCrashRules(
      "DuplicateModsFoundException: Found duplicate mods",
      [...remote, ...BUILT_IN_CRASH_RULES],
    );
    expect(match?.ruleId).toBe("remote_specific");
  });

  it("keeps the first rule when priorities tie", () => {
    const rules = [
      { id: "first", pattern: "boom", messages: { en: "e", ru: "r", uk: "u" } },
      { id: "second", pattern: "boom", messages: { en: "e", ru: "r", uk: "u" } },
    ];
    expect(matchCrashRules("boom", rules)?.ruleId).toBe("first");
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

  it("ignores the ERROR level tag and non-fatal lines, keeping the real exception", () => {
    const log = [
      `[20.06.2026 22:26:46.917] [Render thread/ERROR] [net.minecraftforge.client.gui.overlay.ForgeGui/]: Error rendering overlay 'create:goggle_info'`,
      `[20.06.2026 15:27:07.183] [pool-4-thread-1/WARN] [org.sinytra.connector.transformer.RefmapRemapper/]: Refmap remapper could not find refmap file aaa_particles-fabric-refmap.json`,
      `[20.06.2026 14:10:02.231] [main/ERROR] [mixin/]: Mixin config gamemenuremovegfarb-common.mixins.json does not specify "minVersion" property`,
      `[20.06.2026 15:32:09.206] [Render thread/ERROR]: Reported exception thrown! java.lang.NullPointerException: tick`,
    ].join("\n");
    const signature = extractCrashSignature(log);
    expect(signature).toContain("java.lang.NullPointerException");
    expect(signature).not.toContain("Error rendering overlay");
    expect(signature).not.toContain("minVersion");
    expect(signature).not.toContain("refmap");
  });

  it("falls back to the exit code when the tail has only non-fatal warnings", () => {
    const log = `[14:10:02] [main/ERROR] [mixin/]: Mixin config foo.mixins.json does not specify "minVersion" property`;
    expect(extractCrashSignature(log, 1)).toBe("exit code 1");
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

  it("clamps a broken remote priority to a usable number", () => {
    const [defaulted, huge, negative] = sanitizeCrashRules([
      { id: "a", pattern: "a", messages: { en: "e", ru: "r", uk: "u" } },
      {
        id: "b",
        pattern: "b",
        priority: Number.POSITIVE_INFINITY,
        messages: { en: "e", ru: "r", uk: "u" },
      },
      {
        id: "c",
        pattern: "c",
        priority: -50,
        messages: { en: "e", ru: "r", uk: "u" },
      },
    ]);

    expect(defaulted.priority).toBe(DEFAULT_CRASH_RULE_PRIORITY);
    expect(huge.priority).toBe(DEFAULT_CRASH_RULE_PRIORITY);
    expect(negative.priority).toBe(0);
  });

  it("validates every regex of a multi-pattern rule", () => {
    const rules = sanitizeCrashRules([
      {
        id: "ok",
        allPatterns: ["abc", "def"],
        messages: { en: "e", ru: "r", uk: "u" },
      },
      {
        id: "broken",
        allPatterns: ["abc", "(["],
        messages: { en: "e", ru: "r", uk: "u" },
      },
      {
        id: "not-strings",
        allPatterns: [1],
        messages: { en: "e", ru: "r", uk: "u" },
      },
    ]);

    expect(rules.map((rule) => rule.id)).toEqual(["ok"]);
  });
});

describe("describeUnsafePattern", () => {
  it("accepts every pattern the shipped rules carry", () => {
    const shipped = BUILT_IN_CRASH_RULES.flatMap((rule) => [
      ...(rule.pattern ? [rule.pattern] : []),
      ...(rule.allPatterns ?? []),
      ...(rule.culpritPattern ? [rule.culpritPattern] : []),
    ]);

    expect(shipped.length).toBeGreaterThanOrEqual(25);
    for (const pattern of shipped) {
      expect([pattern, describeUnsafePattern(pattern)]).toEqual([
        pattern,
        null,
      ]);
    }
  });

  it("accepts the rules an admin can already save on the dashboard", () => {
    expect(describeUnsafePattern("(\\w+) +at ")).toBeNull();
    expect(describeUnsafePattern("(\\S+) *\\|")).toBeNull();
  });

  it("accepts the shapes real crash rules use", () => {
    expect(describeUnsafePattern("java\\.lang\\.OutOfMemoryError")).toBeNull();
    expect(describeUnsafePattern("Failed to load mod: [\\w.-]+")).toBeNull();
    expect(describeUnsafePattern("(?:Caused by|at)\\s+\\S+")).toBeNull();
    expect(
      describeUnsafePattern("mixin\\.injection\\.\\w+\\s*\\{\\d+\\}"),
    ).toBeNull();
  });

  it("refuses a nested quantifier", () => {
    expect(describeUnsafePattern("(a+)+")).toMatch(/nested/);
    expect(describeUnsafePattern("(\\d*)*b")).toMatch(/nested/);
    expect(describeUnsafePattern("([a-z]+){2,}")).toMatch(/nested/);
  });

  it("refuses the forms a bracket-blind scan lets through", () => {
    expect(describeUnsafePattern("((a+))+")).toMatch(/nested/);
    expect(describeUnsafePattern("(a|a)*b")).toMatch(/alternation/);
  });

  it("does not mistake a group modifier for a quantifier", () => {
    expect(describeUnsafePattern("(?:(?:abc))+")).toBeNull();
    expect(describeUnsafePattern("(?<name>abc)+")).toBeNull();
  });

  it("ignores quantifier characters inside a character class", () => {
    expect(describeUnsafePattern("([*+?])+")).toBeNull();
  });

  it("refuses a pattern longer than the cap", () => {
    expect(describeUnsafePattern("a".repeat(MAX_PATTERN_LENGTH))).toBeNull();
    expect(describeUnsafePattern("a".repeat(MAX_PATTERN_LENGTH + 1))).toMatch(
      /longer than/,
    );
  });

  it("reads a fixed count as that many adjacent copies", () => {
    expect(describeUnsafePattern("(a+){8}b")).toMatch(/chains more than/);
    expect(describeUnsafePattern("(a+){12}b")).toMatch(/chains more than/);
    expect(describeUnsafePattern("(a+){3}")).toMatch(/chains more than/);
    expect(describeUnsafePattern("(.*){3}END")).toMatch(/chains more than/);
    expect(describeUnsafePattern("(a+){2}b")).toMatch(/nothing that has to/);
    expect(describeUnsafePattern("=(a+){2}b")).toBeNull();
    expect(describeUnsafePattern("(\\d{1,3}\\.){3}\\d{1,3}")).toBeNull();
    expect(describeUnsafePattern("(ab){3}c")).toBeNull();
  });

  it("finds a repeated alternation through a bracket and a `{1}`", () => {
    for (const pattern of [
      "((a|aa)){20}x",
      "((a|aa){1}){20}x",
      "(x((a|aa){1})){20}y",
      "((.*|x)){3}END",
      "((?:.*|x){1}){3}END",
    ]) {
      expect([pattern, describeUnsafePattern(pattern)]).toEqual([
        pattern,
        expect.stringMatching(/same text|nested inside a repeated group/),
      ]);
    }

    expect(describeUnsafePattern("(a+|b){3}c")).toMatch(/nested inside/);
    expect(describeUnsafePattern("(a+|b){8}c")).toMatch(/nested inside/);
    expect(describeUnsafePattern("((a+|b)){3}c")).toMatch(/nested inside/);
    expect(describeUnsafePattern("((a+|b){1}){3}c")).toMatch(/nested inside/);
    expect(describeUnsafePattern("(a+|b){3,}c")).toMatch(/nested inside/);

    expect(describeUnsafePattern("((a|b)){50}x")).toBeNull();
    expect(describeUnsafePattern("((?:Caused by|at)){2}\\s+\\S+")).toBeNull();
    expect(describeUnsafePattern("((Exception|Error))")).toBeNull();
    expect(describeUnsafePattern("(forge|fabric|quilt)")).toBeNull();
  });

  it("does not let `{1}` launder a repetition out of the chain", () => {
    expect(describeUnsafePattern("((.*){1}){3}END")).toMatch(/chains more than/);
    expect(describeUnsafePattern("(?:(?:.*){1}){3}END")).toMatch(
      /chains more than/,
    );
    expect(describeUnsafePattern("((\\w*){1}){3}QQQ")).toMatch(
      /chains more than/,
    );
    expect(describeUnsafePattern("((a+){1}){2}b")).toMatch(
      /nothing that has to/,
    );
    expect(describeUnsafePattern("((a+){01}){2}b")).toMatch(
      /nothing that has to/,
    );
    expect(describeUnsafePattern("((.*){1})((.*){1})((.*){1})END")).toMatch(
      /chains more than/,
    );
    expect(describeUnsafePattern("(a+){1}")).toBeNull();
    expect(describeUnsafePattern("(?:x){1}y")).toBeNull();
    expect(describeUnsafePattern("(ab){1}c")).toBeNull();
    expect(describeUnsafePattern("((mod )?){1}[\\w-]+")).toBeNull();
  });

  it("refuses a pattern whose expansion hits the ceiling", () => {
    expect(
      describeUnsafePattern("((((((x?){3}){3}){3}){3}){3}){3}(a+){3}b"),
    ).toMatch(/chains more than/);
    expect(
      describeUnsafePattern("(((((((x?){3}){3}){3}){3}){3}){3}){3}(a+){3}b"),
    ).toMatch(/deeper than the check can expand/);
    expect(
      describeUnsafePattern("((((((((?!q)){3}){3}){3}){3}){3}){3}){3}(a+){3}b"),
    ).toMatch(/deeper than the check can expand/);
    expect(
      describeUnsafePattern("(((((((x?){3}){3}){3}){3}){3}){3}){3}"),
    ).toMatch(/deeper than the check can expand/);
    expect(describeUnsafePattern("((((a){9}){9}){9}){9}")).toBeNull();
    expect(describeUnsafePattern("(((((a){9}){9}){9}){9}){9}")).toBeNull();
  });

  it("refuses a repeated alternation whose branches overlap", () => {
    expect(describeUnsafePattern("(a|aa){50}x")).toMatch(/same text/);
    expect(describeUnsafePattern("(?:a|aa){30}x")).toMatch(/same text/);
    expect(describeUnsafePattern("(\\w|\\w\\w){40}X")).toMatch(/same text/);
    expect(describeUnsafePattern("(a|){5}x")).toMatch(/same text/);
    expect(describeUnsafePattern("(a|b){50}x")).toBeNull();
    expect(describeUnsafePattern("(?:Caused by|at){2}\\s+\\S+")).toBeNull();
    expect(describeUnsafePattern("(a|aa)*x")).toMatch(/alternation/);
  });

  it("counts a repetition with a large upper bound as unbounded", () => {
    expect(describeUnsafePattern("\\w{1,128}\\w{1,128}X")).toMatch(
      /nothing that has to/,
    );
    expect(describeUnsafePattern("\\w{1,400}\\w{1,400}X")).toMatch(
      /nothing that has to/,
    );
    expect(describeUnsafePattern("a{1,10000}a{1,10000}b")).toMatch(
      /nothing that has to/,
    );
    expect(describeUnsafePattern("[\\s\\S]{1,10000}x{1,10000}END")).toMatch(
      /nothing that has to/,
    );
    expect(describeUnsafePattern("\\w{1,1000}\\w{1,1000}\\w{1,1000}X")).toMatch(
      /chains more than/,
    );
    expect(describeUnsafePattern("\\w{1,127}\\w{1,127}X")).toBeNull();
    expect(describeUnsafePattern("a{1,3}a{1,3}b")).toBeNull();
    expect(describeUnsafePattern("\\w{1,200}X")).toBeNull();
    expect(describeUnsafePattern("=\\w{1,200}\\w{1,200}X")).toBeNull();
  });

  it("refuses a chain of bounded repetitions by the product of their bounds", () => {
    expect(describeUnsafePattern("\\w{1,127}\\w{1,127}\\w{1,127}X")).toMatch(
      /multiply past/,
    );
    expect(
      describeUnsafePattern("\\w{1,127}\\w{1,127}\\w{1,127}\\w{1,127}X"),
    ).toMatch(/multiply past/);
    expect(describeUnsafePattern(`${"\\w{1,60}".repeat(4)}X`)).toMatch(
      /multiply past/,
    );
    expect(describeUnsafePattern(`${"\\w{1,20}".repeat(6)}X`)).toMatch(
      /multiply past/,
    );
    expect(describeUnsafePattern(`${"\\w{1,10}".repeat(10)}X`)).toMatch(
      /multiply past/,
    );
    expect(describeUnsafePattern(`${"\\w{1,5}".repeat(20)}X`)).toMatch(
      /multiply past/,
    );
    expect(describeUnsafePattern(`${"\\w{1,3}".repeat(30)}X`)).toMatch(
      /multiply past/,
    );
    expect(describeUnsafePattern("(\\w{1,100}){9}X")).toMatch(/multiply past/);
    expect(describeUnsafePattern(`a${"\\w{1,20}".repeat(6)}X`)).toMatch(
      /multiply past/,
    );
  });

  it("cuts the product at the largest one the shipped shapes need", () => {
    expect(describeUnsafePattern("\\w{1,3}\\w{1,43}\\w{1,127}X")).toBeNull();
    expect(describeUnsafePattern("\\w{1,4}\\w{1,64}\\w{1,64}X")).toBeNull();
    expect(describeUnsafePattern("\\w{1,5}\\w{1,29}\\w{1,113}X")).toMatch(
      /multiply past/,
    );
    expect(describeUnsafePattern("\\w{1,64}\\w{1,64}\\w{1,5}X")).toMatch(
      /multiply past/,
    );
    expect(describeUnsafePattern("\\w{1,127}\\w{1,127}X")).toBeNull();
    expect(describeUnsafePattern("=\\w*\\w*END")).toBeNull();
    expect(describeUnsafePattern("\\s+\\S*?([^\\s/\\\\:]+\\.jar)")).toBeNull();
    expect(describeUnsafePattern("(mod )?[\\w-]+")).toBeNull();
    expect(describeUnsafePattern(`=${"\\w{0,1}".repeat(30)}\\w+END`)).toBeNull();
    expect(describeUnsafePattern(`=${"\\w{5}".repeat(30)}\\w+END`)).toBeNull();
    expect(describeUnsafePattern("(\\d{1,3}\\.){3}\\d{1,3}")).toBeNull();
  });

  it("answers both spellings of one chain identically", () => {
    const written = describeUnsafePattern("\\w{1,100}\\w{1,100}\\w{1,100}X");
    expect(written).toMatch(/multiply past/);
    expect(describeUnsafePattern("(\\w{1,100}){3}X")).toBe(written);
    expect(describeUnsafePattern("((\\w{1,100}){1}){3}X")).toBe(written);
    expect(describeUnsafePattern("(?:\\w{1,100}){3}X")).toBe(written);
  });

  it("refuses a pair over a set that runs past the newline, gate or no gate", () => {
    expect(describeUnsafePattern("^[\\s\\S]*[\\s\\S]*END")).toMatch(
      /past the newline with another/,
    );
    expect(describeUnsafePattern("=[\\s\\S]*[\\s\\S]*END")).toMatch(
      /past the newline with another/,
    );
    expect(describeUnsafePattern("END[\\w\\W]*[\\w\\W]*x")).toMatch(
      /past the newline with another/,
    );
    expect(describeUnsafePattern("^[\\s\\S]*END")).toBeNull();
    expect(describeUnsafePattern("END[\\w\\W]*")).toBeNull();
    expect(describeUnsafePattern("Mod '([^']+)'")).toBeNull();
    expect(describeUnsafePattern("^.*.*END")).toBeNull();
  });

  it("does not let a nested count cost more than the pattern", () => {
    const nested = `${"(".repeat(7)}a+${"){9}".repeat(7)}b`;
    expect(nested.length).toBeLessThan(MAX_PATTERN_LENGTH);
    const started = Date.now();
    expect(describeUnsafePattern(nested)).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("refuses a chain of adjacent quantifiers", () => {
    expect(describeUnsafePattern("a*a*a*a*a*a*a*a*b")).toMatch(/chains/);
    expect(describeUnsafePattern(`${"a*".repeat(12)}b`)).toMatch(/chains/);
    expect(describeUnsafePattern(`${".*".repeat(10)}END`)).toMatch(/chains/);
    expect(describeUnsafePattern(`${"\\w*".repeat(10)};`)).toMatch(/chains/);
    expect(describeUnsafePattern(`${"[a-z]*".repeat(8)};`)).toMatch(/chains/);
    expect(describeUnsafePattern(`${"\\s*".repeat(10)}X`)).toMatch(/chains/);
  });

  it("sees through groups that only wrap a chain", () => {
    expect(describeUnsafePattern(`${"(a)*".repeat(8)}b`)).toMatch(/chains/);
    expect(describeUnsafePattern("(a*)(a*)(a*)b")).toMatch(/chains/);
  });

  it("counts a chain across backreferences and plain atoms", () => {
    expect(describeUnsafePattern(`${"(a)\\1*".repeat(10)}b`)).toMatch(/chains/);
    expect(describeUnsafePattern("a\\1*a\\1*a\\1*b")).toMatch(/chains/);
  });

  it("does not count quantifiers whose characters cannot overlap", () => {
    expect(describeUnsafePattern("Mod ID: '?([\\w-]+)'?")).toBeNull();
    expect(describeUnsafePattern("\\s+\\S*?([^\\s/\\\\:]+\\.jar)")).toBeNull();
    expect(describeUnsafePattern("\\d+\\.\\d+\\.\\d+")).toBeNull();
    expect(describeUnsafePattern("a*b*c*d")).toBeNull();
  });

  it("does not count a bounded quantifier towards the run", () => {
    expect(describeUnsafePattern("(mod )?[\\w-]+")).toBeNull();
    expect(describeUnsafePattern("Mod ID: '?([\\w-]+)'?")).toBeNull();
    expect(describeUnsafePattern("=\\w{0,1}\\w+END")).toBeNull();
    expect(describeUnsafePattern("a{1,3}a{1,3}b")).toBeNull();
    expect(describeUnsafePattern("a{2,}a{2,}b")).toMatch(/chains/);
  });

  it("allows the two adjacent quantifiers real rules use", () => {
    expect(describeUnsafePattern("=a*a*b")).toBeNull();
    expect(describeUnsafePattern("=a*a*a*b")).toMatch(/chains/);
  });

  it("refuses two adjacent quantifiers over sets that match almost anything", () => {
    expect(describeUnsafePattern(".*.*END")).toMatch(/chains/);
    expect(describeUnsafePattern("[\\w\\W]*[\\w\\W]*END")).toMatch(/chains/);
    expect(describeUnsafePattern("[\\s\\S]*[\\s\\S]*END")).toMatch(/chains/);
    expect(describeUnsafePattern(".*[\\w\\W]*END")).toMatch(/chains/);
    expect(describeUnsafePattern("[^a]*[^a]*END")).toMatch(/chains/);
    expect(describeUnsafePattern("(.)*(.)*END")).toMatch(/chains/);
  });

  it("leaves a single wide quantifier alone", () => {
    expect(describeUnsafePattern(".*END")).toBeNull();
    expect(describeUnsafePattern("\\S*END")).toBeNull();
    expect(describeUnsafePattern("RegionFile .* corrupt")).toBeNull();
    expect(
      describeUnsafePattern(
        "\\[(\\d{2}):(\\d{2}):(\\d{2})\\] \\[([^\\]]+)\\]: (.*)",
      ),
    ).toBeNull();
  });

  it("refuses a lone repetition that nothing stops", () => {
    expect(describeUnsafePattern("[\\w\\W]*END")).toMatch(/past the newline/);
    expect(describeUnsafePattern("[\\s\\S]*END")).toMatch(/past the newline/);
    expect(describeUnsafePattern("[^a]*END")).toMatch(/past the newline/);
    expect(describeUnsafePattern("\\W*END")).toMatch(/past the newline/);
    expect(describeUnsafePattern("[\\w\\s]*END")).toMatch(/past the newline/);
    expect(describeUnsafePattern("[\\x00-\\uffff]*END")).toMatch(
      /past the newline/,
    );
  });

  it("allows a repetition nothing stops behind a gate", () => {
    expect(describeUnsafePattern("Mod '([^']+)'")).toBeNull();
    expect(describeUnsafePattern("\\[([^\\]]+)\\]")).toBeNull();
    expect(describeUnsafePattern("END[\\w\\W]*")).toBeNull();
    expect(describeUnsafePattern("^[\\w\\W]*END")).toBeNull();
  });

  it("does not call a quantifier wide when it stops at whitespace", () => {
    expect(
      describeUnsafePattern(
        "(?:corrupt jarfile|opening zip file)\\s+\\S*?([^\\s/\\\\:]+\\.jar)",
      ),
    ).toBeNull();
    expect(
      describeUnsafePattern(
        "which is missing|Unmet dependency listing|requires (any )?version .* of (mod )?[\\w-]+",
      ),
    ).toBeNull();
    expect(describeUnsafePattern("(\\d{1,3}\\.){3}\\d{1,3}")).toBeNull();
  });

  it("breaks a chain at an alternation instead of guessing a branch", () => {
    expect(describeUnsafePattern("(?:Caused by|at)\\s+\\S+")).toBeNull();
  });

  it("refuses an alternation nested deeper than the repeated group", () => {
    expect(describeUnsafePattern("((a|a))*b")).toMatch(/alternation/);
    expect(describeUnsafePattern("(?:(a|a))*b")).toMatch(/alternation/);
    expect(describeUnsafePattern("((?:a|a))*b")).toMatch(/alternation/);
    expect(describeUnsafePattern("(((a|a)))*b")).toMatch(/alternation/);
    expect(describeUnsafePattern("((a|a))+b")).toMatch(/alternation/);
    expect(describeUnsafePattern("((a|a)){2,}b")).toMatch(/alternation/);
    expect(describeUnsafePattern("((a|.))*b")).toMatch(/alternation/);
    expect(describeUnsafePattern("((\\d|\\w))*!")).toMatch(/alternation/);
    expect(describeUnsafePattern("((a|a)|(a))*b")).toMatch(/alternation/);
  });

  it("refuses a wide pair written as a positive set or a range", () => {
    expect(describeUnsafePattern("[ -~]*[ -~]*END")).toMatch(/chains/);
    expect(describeUnsafePattern("[\\w\\s]*[\\w\\s]*END")).toMatch(/chains/);
    expect(describeUnsafePattern("[\\x00-\\uffff]*[\\x00-\\uffff]*END")).toMatch(
      /chains/,
    );
  });

  it("refuses a token-wide pair that can start on any character", () => {
    expect(describeUnsafePattern("\\S*\\S*END")).toMatch(/chains/);
    expect(describeUnsafePattern("(\\w)*(\\w)*b")).toMatch(/chains/);
    expect(describeUnsafePattern(".*\\S*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\w*\\w*END")).toMatch(/chains/);
    expect(describeUnsafePattern("[\\w-]*[\\w-]*END")).toMatch(/chains/);
  });

  it("allows a token-wide pair behind a gate that must match", () => {
    expect(
      describeUnsafePattern(
        "(?:corrupt jarfile|opening zip file)\\s+\\S*?([^\\s/\\\\:]+\\.jar)",
      ),
    ).toBeNull();
    expect(describeUnsafePattern("\\s+\\S*?([^\\s/\\\\:]+\\.jar)")).toBeNull();
    expect(describeUnsafePattern("=\\w*\\w*END")).toBeNull();
    expect(describeUnsafePattern("=?\\w*\\w*END")).toMatch(/chains/);
    expect(describeUnsafePattern("(=)*\\w*\\w*END")).toMatch(/chains/);
  });

  it("refuses a pair separated by a repetition that may match nothing", () => {
    expect(describeUnsafePattern("\\w*\\s*\\w*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\S*\\s*\\S*END")).toMatch(/chains/);
    expect(describeUnsafePattern(".*\\n*.*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\w*\\s*\\w*\\s*\\w*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\s+\\S*?([^\\s/\\\\:]+\\.jar)")).toBeNull();
    expect(describeUnsafePattern("(\\w+) +at ")).toBeNull();
    expect(describeUnsafePattern("a*b*c*d")).toBeNull();
    expect(
      describeUnsafePattern("mixin\\.injection\\.\\w+\\s*\\{\\d+\\}"),
    ).toBeNull();
  });

  it("reads a unicode property escape as one atom", () => {
    expect(describeUnsafePattern("\\p{L}*\\p{L}*END")).toMatch(
      /chains|newline/,
    );
    expect(describeUnsafePattern("\\P{L}*\\P{L}*END")).toMatch(
      /chains|newline/,
    );
    expect(describeUnsafePattern("\\p{L}*END")).toMatch(/newline/);
    expect(describeUnsafePattern("Mod \\p{L}+")).toBeNull();
  });

  it("refuses a narrow repetition parked next to a wide one", () => {
    expect(describeUnsafePattern(".*\\d*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\w*\\d*END")).toMatch(/chains/);
    expect(describeUnsafePattern(".*(\\d)*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\S*x*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\S*[a-z]*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\w*[a-z]*END")).toMatch(/chains/);
    expect(describeUnsafePattern("[\\w-]*[a-z]*END")).toMatch(/chains/);
    expect(describeUnsafePattern("\\d*.*END")).toMatch(/chains/);
    expect(describeUnsafePattern("x*\\S*END")).toMatch(/chains/);
  });

  it("leaves a pair with no shared character alone", () => {
    expect(describeUnsafePattern("a*b*c*d")).toBeNull();
    expect(describeUnsafePattern("\\d+\\.\\d+\\.\\d+")).toBeNull();
    expect(describeUnsafePattern("(\\w+) +at ")).toBeNull();
    expect(describeUnsafePattern("(\\S+) *\\|")).toBeNull();
  });

  it("accepts the stack-trace shapes an admin writes", () => {
    expect(
      describeUnsafePattern("net\\.minecraftforge\\..*\\..*Exception"),
    ).toBeNull();
    expect(describeUnsafePattern("at .*\\..*\\(")).toBeNull();
    expect(describeUnsafePattern("\\s*at .*\\(.*\\.java:\\d+\\)")).toBeNull();
    expect(describeUnsafePattern("Caused by: .*: .*")).toBeNull();
    expect(describeUnsafePattern("\\S*(Exception|Error)\\S*")).toBeNull();
    expect(describeUnsafePattern("^\\S*\\S*END")).toBeNull();
    expect(describeUnsafePattern(".*\\..*END")).toMatch(/chains/);
  });

  it("ends a run at a separator the run cannot match", () => {
    expect(describeUnsafePattern("=.*\\.java:\\d+ at .*")).toBeNull();
    expect(describeUnsafePattern("=.*a.*a.*END")).toMatch(/chains more than/);
  });

  it("carries every unicode space of the whitespace shorthand", () => {
    for (const space of [
      " ",
      "\t",
      "\n",
      "\r",
      "\f",
      "\v",
      "\u00a0",
      "\u1680",
      "\u2028",
      "\u2029",
      "\ufeff",
    ]) {
      expect([space, describeUnsafePattern(`[${space}]+\\S*\\S*X`)]).toEqual([
        space,
        null,
      ]);
    }

    expect(describeUnsafePattern("[a]+\\S*\\S*X")).toMatch(/chains/);
  });
});

describe("sanitizeCrashRules pattern safety", () => {
  it("keeps a rule the dashboard and the API both accept", () => {
    const rules = sanitizeCrashRules([
      {
        id: "spaced",
        pattern: "(\\w+) +at ",
        culpritPattern: "(\\S+) *\\|",
        messages: { en: "e", ru: "r", uk: "u" },
      },
    ]);

    expect(rules.map((rule) => rule.id)).toEqual(["spaced"]);
  });

  it("drops a rule whose flags the safety check does not model", () => {
    const rules = sanitizeCrashRules([
      { id: "s", pattern: "^.*.*END", flags: "si", messages: { en: "e", ru: "r", uk: "u" } },
      { id: "u", pattern: "ok", flags: "u", messages: { en: "e", ru: "r", uk: "u" } },
      { id: "g", pattern: "ok", flags: "gi", messages: { en: "e", ru: "r", uk: "u" } },
      {
        id: "culprit-without-g",
        pattern: "ok",
        culpritPattern: "Mod '([^']+)'",
        culpritFlags: "i",
        messages: { en: "e", ru: "r", uk: "u" },
      },
      {
        id: "kept",
        pattern: "ok",
        flags: "im",
        culpritPattern: "Mod '([^']+)'",
        culpritFlags: "gi",
        messages: { en: "e", ru: "r", uk: "u" },
      },
    ]);

    expect(rules.map((rule) => rule.id)).toEqual(["kept"]);
  });

  it("drops a rule that would hang the log parse on the player's machine", () => {
    const rules = sanitizeCrashRules([
      {
        id: "nested",
        pattern: "((a+))+",
        messages: { en: "e", ru: "r", uk: "u" },
      },
      {
        id: "chained",
        pattern: "a*a*a*b",
        messages: { en: "e", ru: "r", uk: "u" },
      },
      {
        id: "wide",
        allPatterns: ["ok", ".*.*END"],
        messages: { en: "e", ru: "r", uk: "u" },
      },
      {
        id: "culprit",
        pattern: "ok",
        culpritPattern: "(a|a)*b",
        messages: { en: "e", ru: "r", uk: "u" },
      },
    ]);

    expect(rules).toEqual([]);
  });
});

describe("multi-pattern crash rules", () => {
  const rule = {
    id: "optifine_conflict",
    allPatterns: ["OptiFine", "MixinApplyError|InvalidMixinException"],
    messages: { en: "e", ru: "r", uk: "u" },
  };

  it("requires every pattern to be present", () => {
    expect(matchCrashRules("OptiFine loaded", [rule])?.ruleId).toBeUndefined();
    expect(matchCrashRules("MixinApplyError", [rule])?.ruleId).toBeUndefined();
    expect(
      matchCrashRules("OptiFine loaded\nMixinApplyError here", [rule])?.ruleId,
    ).toBe("optifine_conflict");
  });

  it("matches regardless of the order the patterns appear in", () => {
    expect(
      matchCrashRules("InvalidMixinException\n...\nOptiFine", [rule])?.ruleId,
    ).toBe("optifine_conflict");
  });
});

describe("native crash exit codes", () => {
  it("recognises both signed and unsigned Windows access violations", () => {
    const nativeRule = BUILT_IN_CRASH_RULES.find(
      (rule) => rule.id === "native_crash",
    );

    expect(matchCrashRules("", BUILT_IN_CRASH_RULES, 3221225477)?.ruleId).toBe(
      "native_crash",
    );
    expect(matchCrashRules("", BUILT_IN_CRASH_RULES, -1073741819)?.ruleId).toBe(
      "native_crash",
    );
    expect(nativeRule?.exitCodes).not.toContain(1073740791);
  });
});
