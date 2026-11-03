import { describe, expect, it } from "vitest";
import { resolveReducedMotion } from "./motionPreference";

describe("resolveReducedMotion", () => {
  it("follows the system by default", () => {
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("system", false)).toBe(false);
  });

  it("keeps animations on even when the system turned them off", () => {
    expect(resolveReducedMotion("on", true)).toBe(false);
  });

  it("turns animations off regardless of the system", () => {
    expect(resolveReducedMotion("off", false)).toBe(true);
  });
});
