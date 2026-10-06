import { describe, expect, it } from "vitest";
import {
  assertTrustedDownloadUrl,
  assertTrustedLoaderLibraryUrl,
  isPublishableContentUrl,
  isTrustedDownloadUrl,
  isTrustedServerCoreUrl,
  normalizeLoaderLibraryUrl,
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

  it("accepts the hosts of the loaders for old versions", () => {
    expect(
      isTrustedDownloadUrl("https://meta.legacyfabric.net/v2/versions/game"),
    ).toBe(true);
    expect(
      isTrustedDownloadUrl(
        "https://maven.glass-launcher.net/babric/babric/x.jar",
      ),
    ).toBe(true);
    expect(isTrustedDownloadUrl("https://meta.ornithemc.net/v3/x")).toBe(true);
  });

  it("rejects untrusted hosts, look-alikes and bad input", () => {
    expect(isTrustedDownloadUrl("https://evil.com/x.jar")).toBe(false);
    expect(isTrustedDownloadUrl("https://mojang.com.evil.com/x")).toBe(false);
    expect(isTrustedDownloadUrl("https://notmojang.com/x")).toBe(false);
    expect(isTrustedDownloadUrl("file:///etc/passwd")).toBe(false);
    expect(isTrustedDownloadUrl("http://piston-meta.mojang.com/v1/x.json")).toBe(
      false,
    );
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

describe("normalizeLoaderLibraryUrl", () => {
  it("upgrades legacy forge maven urls to the current https host", () => {
    expect(
      normalizeLoaderLibraryUrl(
        "http://files.minecraftforge.net/maven//net/minecraftforge/forge/forge.jar",
      ),
    ).toBe("https://maven.minecraftforge.net/maven/net/minecraftforge/forge/forge.jar");
  });

  it("keeps modern urls untouched", () => {
    const url = "https://libraries.minecraft.net/net/example/lib.jar";
    expect(normalizeLoaderLibraryUrl(url)).toBe(url);
  });

  it("skips the Legacy Fabric maven redirect", () => {
    expect(
      normalizeLoaderLibraryUrl(
        "https://maven.legacyfabric.net//net/legacyfabric/intermediary/1.8.9/intermediary-1.8.9.jar",
      ),
    ).toBe(
      "https://repo.legacyfabric.net/legacyfabric/net/legacyfabric/intermediary/1.8.9/intermediary-1.8.9.jar",
    );
  });

  it("makes legacy forge libraries pass the trust check", () => {
    expect(
      isTrustedDownloadUrl(
        normalizeLoaderLibraryUrl("http://files.minecraftforge.net/maven/a.jar"),
      ),
    ).toBe(true);
  });
});

describe("isTrustedServerCoreUrl", () => {
  it("allows known server core distributors over https", () => {
    expect(isTrustedServerCoreUrl("https://api.papermc.io/v2/x.jar")).toBe(true);
    expect(isTrustedServerCoreUrl("https://piston-data.mojang.com/s.jar")).toBe(
      true,
    );
  });

  it("refuses unknown hosts and plain http", () => {
    expect(isTrustedServerCoreUrl("https://evil.tld/server.jar")).toBe(false);
    expect(isTrustedServerCoreUrl("http://api.papermc.io/v2/x.jar")).toBe(false);
  });
});

describe("assertTrustedLoaderLibraryUrl", () => {
  it("lets loader profiles pull from Maven Central but keeps it out of shared packs", () => {
    const central =
      "https://repo1.maven.org/maven2/net/minecrell/terminalconsoleappender/1.2.0/terminalconsoleappender-1.2.0.jar";

    expect(assertTrustedLoaderLibraryUrl(central)).toBe(central);
    expect(isTrustedDownloadUrl(central)).toBe(false);
    expect(isPublishableContentUrl(central)).toBe(false);
  });

  it("accepts LWJGL natives from the official build server", () => {
    const natives =
      "https://build.lwjgl.org/release/3.3.3/bin/lwjgl/lwjgl-natives-linux-arm64.jar";

    expect(assertTrustedLoaderLibraryUrl(natives)).toBe(natives);
    expect(isTrustedDownloadUrl(natives)).toBe(false);
  });

  it("refuses other hosts and plain http", () => {
    expect(() =>
      assertTrustedLoaderLibraryUrl("https://evil.com/x.jar"),
    ).toThrow(/Refused untrusted/);
    expect(() =>
      assertTrustedLoaderLibraryUrl("http://repo1.maven.org/x.jar"),
    ).toThrow(/Refused untrusted/);
  });
});
