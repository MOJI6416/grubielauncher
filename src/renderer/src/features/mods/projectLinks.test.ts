import { describe, expect, it } from "vitest";
import { ProjectType, Provider } from "@/types/ModManager";
import { parseProjectLink } from "./projectLinks";

describe("parseProjectLink", () => {
  it("reads Modrinth project pages and their subpages", () => {
    expect(parseProjectLink("https://modrinth.com/mod/sodium")).toEqual({
      provider: Provider.MODRINTH,
      ref: "sodium",
      projectType: ProjectType.MOD,
    });
    expect(
      parseProjectLink("https://www.modrinth.com/shader/complementary-reimagined/versions"),
    ).toEqual({
      provider: Provider.MODRINTH,
      ref: "complementary-reimagined",
      projectType: ProjectType.SHADER,
    });
    expect(parseProjectLink("https://modrinth.com/project/AANobbMI")).toEqual({
      provider: Provider.MODRINTH,
      ref: "AANobbMI",
    });
  });

  it("ignores Modrinth pages that are not a project", () => {
    expect(parseProjectLink("https://modrinth.com/mods?q=jei")).toBeNull();
    expect(parseProjectLink("https://modrinth.com/user/jellysquid3")).toBeNull();
    expect(parseProjectLink("https://modrinth.com/")).toBeNull();
    expect(parseProjectLink("https://docs.modrinth.com/mod/sodium")).toBeNull();
  });

  it("reads CurseForge project pages by class", () => {
    expect(
      parseProjectLink("https://www.curseforge.com/minecraft/mc-mods/jei"),
    ).toEqual({
      provider: Provider.CURSEFORGE,
      ref: "jei",
      projectType: ProjectType.MOD,
    });
    expect(
      parseProjectLink(
        "https://legacy.curseforge.com/minecraft/texture-packs/faithful-32x/files/123",
      ),
    ).toEqual({
      provider: Provider.CURSEFORGE,
      ref: "faithful-32x",
      projectType: ProjectType.RESOURCEPACK,
    });
    expect(
      parseProjectLink("https://www.curseforge.com/minecraft/customization/x"),
    ).toBeNull();
  });

  it("reads numeric and legacy CurseForge links", () => {
    expect(parseProjectLink("https://www.curseforge.com/projects/238222")).toEqual(
      { provider: Provider.CURSEFORGE, ref: "238222" },
    );
    expect(
      parseProjectLink("https://minecraft.curseforge.com/projects/appleskin"),
    ).toEqual({
      provider: Provider.CURSEFORGE,
      ref: "appleskin",
      projectType: ProjectType.MOD,
    });
  });

  it("unwraps CurseForge linkout redirects, even double-encoded ones", () => {
    expect(
      parseProjectLink(
        "https://www.curseforge.com/linkout?remoteUrl=https%253a%252f%252fmodrinth.com%252fmod%252fsodium",
      ),
    ).toEqual({
      provider: Provider.MODRINTH,
      ref: "sodium",
      projectType: ProjectType.MOD,
    });
    expect(
      parseProjectLink(
        "https://www.curseforge.com/linkout?remoteUrl=https%3a%2f%2fgithub.com%2fx",
      ),
    ).toBeNull();
  });

  it("rejects other sites and broken input", () => {
    expect(parseProjectLink("https://github.com/CaffeineMC/sodium")).toBeNull();
    expect(parseProjectLink("not a link")).toBeNull();
    expect(parseProjectLink("javascript:alert(1)")).toBeNull();
    expect(parseProjectLink("#features")).toBeNull();
  });
});
