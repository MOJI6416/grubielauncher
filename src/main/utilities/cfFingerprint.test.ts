import { describe, expect, it } from "vitest";
import { curseForgeFingerprint } from "./cfFingerprint";

function fingerprint(text: string): number {
  return curseForgeFingerprint(Buffer.from(text));
}

describe("curseForgeFingerprint", () => {
  it("matches murmur2 with seed 1 for every tail length", () => {
    expect(fingerprint("")).toBe(1540447798);
    expect(fingerprint("a")).toBe(626045324);
    expect(fingerprint("ab")).toBe(1692487918);
    expect(fingerprint("abc")).toBe(1621425345);
    expect(fingerprint("abcd")).toBe(3376380438);
  });

  it("skips the whitespace bytes CurseForge ignores", () => {
    expect(fingerprint("hello world")).toBe(2824650221);
    expect(fingerprint("Grubie \r\n\t Launcher")).toBe(
      fingerprint("GrubieLauncher"),
    );
    expect(fingerprint("Grubie \r\n\t Launcher")).toBe(2404598888);
  });

  it("stays an unsigned 32-bit number", () => {
    const value = fingerprint("x".repeat(1000));
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
});
