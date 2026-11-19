import { describe, expect, it } from "vitest";
import {
  allowsReleaseType,
  isUpdateChannel,
  resolveUpdateChannel,
} from "./updateChannel";

describe("resolveUpdateChannel", () => {
  it("uses the global channel for a stable game version", () => {
    expect(
      resolveUpdateChannel({ global: "release", gameVersionType: "release" }),
    ).toBe("release");
    expect(
      resolveUpdateChannel({ global: "beta", gameVersionType: "old_beta" }),
    ).toBe("beta");
  });

  it("takes everything for a snapshot unless the instance says otherwise", () => {
    expect(
      resolveUpdateChannel({ global: "release", gameVersionType: "snapshot" }),
    ).toBe("alpha");
    expect(
      resolveUpdateChannel({
        instance: "release",
        global: "beta",
        gameVersionType: "snapshot",
      }),
    ).toBe("release");
  });

  it("treats an unknown version type as stable", () => {
    expect(resolveUpdateChannel({ global: "release" })).toBe("release");
  });

  it("ignores a broken instance value", () => {
    expect(
      resolveUpdateChannel({
        instance: "nightly" as never,
        global: "beta",
        gameVersionType: "release",
      }),
    ).toBe("beta");
  });
});

describe("allowsReleaseType", () => {
  it("orders release, beta and alpha", () => {
    expect(allowsReleaseType("release", "beta")).toBe(false);
    expect(allowsReleaseType("beta", "beta")).toBe(true);
    expect(allowsReleaseType("beta", "alpha")).toBe(false);
    expect(allowsReleaseType("alpha", "alpha")).toBe(true);
    expect(allowsReleaseType("release", undefined)).toBe(true);
  });

  it("knows its own values", () => {
    expect(isUpdateChannel("beta")).toBe(true);
    expect(isUpdateChannel("stable")).toBe(false);
  });
});
