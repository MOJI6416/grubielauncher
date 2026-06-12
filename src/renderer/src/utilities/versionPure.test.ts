import { describe, expect, it } from "vitest";

import {
  checkVersionName,
  isOwner,
  parseVersionOwner,
  supportsQuickPlayMultiplayer,
} from "./versionPure";
import type { IVersionConf } from "@/types/IVersion";

function version(name: string): IVersionConf {
  return { name } as IVersionConf;
}

describe("version pure helpers", () => {
  it("detects version ownership by persisted account key", () => {
    expect(
      isOwner("discord_Notch", {
        type: "discord",
        nickname: "Notch",
      } as any),
    ).toBe(true);

    expect(
      isOwner("discord_Notch", {
        type: "microsoft",
        nickname: "Notch",
      } as any),
    ).toBe(false);

    expect(
      isOwner(undefined, { type: "discord", nickname: "Notch" } as any),
    ).toBe(false);
  });

  it("parses stored owner keys without losing nicknames containing underscores", () => {
    expect(parseVersionOwner("discord_pack_owner")).toEqual({
      type: "discord",
      nickname: "pack_owner",
    });

    expect(parseVersionOwner("legacyOwner")).toEqual({
      type: undefined,
      nickname: "legacyOwner",
    });

    expect(parseVersionOwner()).toBeNull();
  });

  it("rejects duplicate version names for new versions", () => {
    expect(
      checkVersionName("Fabulously Optimized", [
        version("fabulously optimized"),
      ]),
    ).toBe(false);
  });

  it("allows keeping the same name while editing the selected version", () => {
    const selected = version("Fabulously Optimized");

    expect(checkVersionName("Fabulously Optimized", [selected], selected)).toBe(
      true,
    );
  });

  it("rejects forbidden filesystem characters and overlong names", () => {
    expect(checkVersionName("Bad/Name", [])).toBe(false);
    expect(checkVersionName("a".repeat(33), [])).toBe(false);
  });
});

describe("supportsQuickPlayMultiplayer", () => {
  it("detects 1.20+ releases", () => {
    expect(supportsQuickPlayMultiplayer("1.20")).toBe(true);
    expect(supportsQuickPlayMultiplayer("1.20.1")).toBe(true);
    expect(supportsQuickPlayMultiplayer("1.21.4")).toBe(true);
  });

  it("rejects older releases and snapshots", () => {
    expect(supportsQuickPlayMultiplayer("1.19.4")).toBe(false);
    expect(supportsQuickPlayMultiplayer("1.8.0")).toBe(false);
    expect(supportsQuickPlayMultiplayer("23w14a")).toBe(false);
  });
});
