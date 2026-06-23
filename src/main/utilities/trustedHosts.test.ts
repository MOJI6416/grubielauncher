import { describe, expect, it } from "vitest";
import {
  assertTrustedDownloadUrl,
  isTrustedDownloadUrl,
} from "./trustedHosts";

describe("isTrustedDownloadUrl", () => {
  it("accepts known Minecraft ecosystem hosts", () => {
    expect(
      isTrustedDownloadUrl("https://piston-meta.mojang.com/v1/x.json"),
    ).toBe(true);
    expect(isTrustedDownloadUrl("https://libraries.minecraft.net/a.jar")).toBe(
      true,
    );
    expect(isTrustedDownloadUrl("https://meta.fabricmc.net/v2/x")).toBe(true);
    expect(isTrustedDownloadUrl("https://meta.quiltmc.org/v3/x")).toBe(true);
    expect(
      isTrustedDownloadUrl("https://maven.minecraftforge.net/x.jar"),
    ).toBe(true);
    expect(isTrustedDownloadUrl("https://maven.neoforged.net/x.jar")).toBe(true);
    expect(
      isTrustedDownloadUrl("https://api.grubielauncher.com/loaders/forge.json"),
    ).toBe(true);
  });

  it("rejects untrusted hosts, look-alikes and bad input", () => {
    expect(isTrustedDownloadUrl("https://evil.com/x.jar")).toBe(false);
    expect(isTrustedDownloadUrl("https://mojang.com.evil.com/x")).toBe(false);
    expect(isTrustedDownloadUrl("https://notmojang.com/x")).toBe(false);
    expect(isTrustedDownloadUrl("file:///etc/passwd")).toBe(false);
    expect(isTrustedDownloadUrl("")).toBe(false);
    expect(isTrustedDownloadUrl(undefined as unknown as string)).toBe(false);
  });
});

describe("assertTrustedDownloadUrl", () => {
  it("throws on untrusted urls and returns the url on trusted ones", () => {
    expect(() => assertTrustedDownloadUrl("https://evil.com/x")).toThrow();
    expect(
      assertTrustedDownloadUrl("https://piston-meta.mojang.com/x"),
    ).toContain("mojang");
  });
});
