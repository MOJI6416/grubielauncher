import { describe, expect, it } from "vitest";
import { Provider } from "@/types/ModManager";
import { displayTitle, installedVersionLabel, versionToken } from "./titles";

describe("displayTitle", () => {
  it.each([
    ["TerraBlender (NeoForge)", "TerraBlender"],
    ["Cloth Config API (Fabric/Forge/NeoForge)", "Cloth Config API"],
    ["Entity Culling Fabric/Forge", "Entity Culling"],
    ["[1.21.1] SecurityCraft", "SecurityCraft"],
    ["Jade [Fabric & NeoForge 1.21.1]", "Jade"],
    ["Balm - NeoForge", "Balm"],
    ["Sodium (1.21.x)", "Sodium"],
  ])("drops the loader tag from %s", (title, expected) => {
    expect(displayTitle(title)).toBe(expected);
  });

  it.each([
    "Just Enough Items (JEI)",
    "Kotlin for Forge",
    "Create Fabric",
    "Forgified Fabric API",
    "Fabric API",
    "Applied Energistics 2",
    "AE2 Growth Accelerators",
  ])("leaves %s alone", (title) => {
    expect(displayTitle(title)).toBe(title);
  });

  it("never blanks a title that is nothing but a tag", () => {
    expect(displayTitle("(NeoForge)")).toBe("(NeoForge)");
  });
});

describe("versionToken", () => {
  it.each([
    ["TerraBlender-neoforge-1.21.1-4.1.0.8.jar", "4.1.0.8"],
    ["ironchest-1.21-neoforge-16.0.7.jar", "16.0.7"],
    ["sodium-neoforge-0.6.0+mc1.21.1.jar", "0.6.0"],
    ["entityculling-neoforge-1.11.2-mc1.21.1.jar", "1.11.2"],
    ["[1.21.1] SecurityCraft v1.10.2.1.jar", "1.10.2.1"],
    ["AGA Neo1.21.1 2.2.0.jar", "2.2.0"],
    ["lostcitiesautoloader-1.0.1-1.21.1.jar.disabled", "1.0.1"],
  ])("reads the mod version from %s", (fileName, expected) => {
    expect(versionToken(fileName, "1.21.1")).toBe(expected);
  });

  it("finds nothing when the name only carries the game version", () => {
    expect(versionToken("jei-1.21.1.jar", "1.21.1")).toBeNull();
    expect(versionToken("resources.zip", "1.21.1")).toBeNull();
  });
});

describe("installedVersionLabel", () => {
  const files = (filename: string) => [
    { filename, size: 1, url: "", sha1: "", isServer: true },
  ];

  it("prefers the file name and falls back to local metadata", () => {
    expect(
      installedVersionLabel(
        {
          provider: Provider.LOCAL,
          version: { id: "3.2.1", dependencies: [], files: files("mymod.jar") },
        },
        "1.21.1",
      ),
    ).toBe("3.2.1");
  });

  it("does not read a catalog file id as a version", () => {
    expect(
      installedVersionLabel(
        {
          provider: Provider.CURSEFORGE,
          version: { id: "5491156", dependencies: [], files: files("x.jar") },
        },
        "1.21.1",
      ),
    ).toBeNull();
  });
});
