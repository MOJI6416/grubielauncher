import { describe, expect, it } from "vitest";

import {
  isOwner,
  parseVersionOwner,
  sanitizeExtraFileSegments,
  supportsQuickPlayMultiplayer,
} from "./versionPure";

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

});

describe("sanitizeExtraFileSegments", () => {
  it("keeps plain relative modpack paths", () => {
    expect(sanitizeExtraFileSegments("config/mod/settings.json")).toEqual([
      "config",
      "mod",
      "settings.json",
    ]);
    expect(sanitizeExtraFileSegments("./config//a.txt")).toEqual([
      "config",
      "a.txt",
    ]);
  });

  it("rejects traversal through both separators", () => {
    expect(sanitizeExtraFileSegments("../evil.json")).toBeNull();
    expect(sanitizeExtraFileSegments("..\\..\\..\\evil.json")).toBeNull();
    expect(sanitizeExtraFileSegments("config\\..\\..\\evil.json")).toBeNull();
  });

  it("rejects drive-qualified and empty paths, strips leading separators", () => {
    expect(sanitizeExtraFileSegments("C:\\Windows\\evil.json")).toBeNull();
    expect(sanitizeExtraFileSegments("/etc/passwd")).toEqual([
      "etc",
      "passwd",
    ]);
    expect(sanitizeExtraFileSegments("")).toBeNull();
    expect(sanitizeExtraFileSegments("./")).toBeNull();
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
