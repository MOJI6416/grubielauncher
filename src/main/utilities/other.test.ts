import { describe, expect, it } from "vitest";
import { getJavaAgent, HTTP_AGENT_JVM_ARGUMENT, matchesOsRules } from "./other";

describe("getJavaAgent", () => {
  it("exports the legacy Java User-Agent JVM argument", () => {
    expect(HTTP_AGENT_JVM_ARGUMENT).toBe("-Dhttp.agent=Mozilla/5.0");
  });

  it("keeps the public Grubie auth server for Grubie/Discord accounts", () => {
    expect(getJavaAgent("discord", "authlib-injector.jar")).toBe(
      "-javaagent:authlib-injector.jar=grubielauncher.com",
    );
  });

  it("keeps Ely.by server unchanged", () => {
    expect(getJavaAgent("elyby", "authlib-injector.jar")).toBe(
      "-javaagent:authlib-injector.jar=ely.by",
    );
  });
});

describe("matchesOsRules", () => {
  const windowsX64 = { os: "windows" as const, arch: "x64" as const };
  const osxArm64 = { os: "osx" as const, arch: "arm64" as const };

  it("allows when there are no rules", () => {
    expect(matchesOsRules(undefined, windowsX64)).toBe(true);
    expect(matchesOsRules([], windowsX64)).toBe(true);
  });

  it("handles allow rules with os name", () => {
    const rules = [{ action: "allow", os: { name: "osx" } }];
    expect(matchesOsRules(rules, osxArm64)).toBe(true);
    expect(matchesOsRules(rules, windowsX64)).toBe(false);
  });

  it("handles unconditional allow with platform-specific disallow", () => {
    const rules = [
      { action: "allow" },
      { action: "disallow", os: { name: "osx" } },
    ];
    expect(matchesOsRules(rules, windowsX64)).toBe(true);
    expect(matchesOsRules(rules, osxArm64)).toBe(false);
  });

  it("does not match x86 arch rules on x64/arm64 platforms", () => {
    const rules = [{ action: "allow", os: { arch: "x86" } }];
    expect(matchesOsRules(rules, windowsX64)).toBe(false);
    expect(matchesOsRules(rules, osxArm64)).toBe(false);
  });

  it("matches os version rules via regex against the release string", () => {
    const rules = [
      { action: "allow", os: { name: "windows", version: "^10\\." } },
    ];
    expect(matchesOsRules(rules, windowsX64, "10.0.26200")).toBe(true);
    expect(matchesOsRules(rules, windowsX64, "6.1.7601")).toBe(false);
  });

  it("skips rules gated by features", () => {
    const rules = [
      { action: "allow", features: { is_demo_user: true } },
    ];
    expect(matchesOsRules(rules, windowsX64)).toBe(false);
  });
});
