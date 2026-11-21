import { describe, expect, it } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import {
  buildMrpackIndex,
  isExportEntryShown,
  isTechnicalExportEntry,
  keepSelectedProjects,
  mrpackDependencies,
  mrpackLinks,
} from "./instanceExport";

function project(
  projectType: ProjectType,
  provider: Provider,
  url: string,
): ILocalProject {
  return {
    title: "x",
    description: "",
    projectType,
    iconUrl: null,
    url: "",
    provider,
    id: "x",
    version: {
      id: "v",
      dependencies: [],
      files: [{ filename: "x.jar", size: 10, sha1: "ABC", url, isServer: true }],
    },
  };
}

describe("isTechnicalExportEntry", () => {
  it("treats the launcher's own files as technical", () => {
    for (const name of ["version.json", "storage", "1.21.1.jar", "forge.json", "icon.png", "Storage/worlds"]) {
      expect(isTechnicalExportEntry(name)).toBe(true);
    }
    for (const name of ["mods", "config", "options.txt", "saves"]) {
      expect(isTechnicalExportEntry(name)).toBe(false);
    }
  });

  it("hides the server folder only for Modrinth packs", () => {
    expect(isExportEntryShown("server", "grubie")).toBe(true);
    expect(isExportEntryShown("server", "mrpack")).toBe(false);
    expect(isExportEntryShown("mods", "mrpack")).toBe(true);
  });
});

describe("mrpackDependencies", () => {
  it("strips loader prefixes the way the importer expects", () => {
    expect(
      mrpackDependencies({
        version: { id: "1.20.1" } as never,
        loader: { name: "forge", version: { id: "1.20.1-47.2.0", url: "" }, mods: [] },
      }),
    ).toEqual({ minecraft: "1.20.1", forge: "47.2.0" });
    expect(
      mrpackDependencies({
        version: { id: "1.21.1" } as never,
        loader: { name: "neoforge", version: { id: "21.1.77", url: "" }, mods: [] },
      }),
    ).toEqual({ minecraft: "1.21.1", neoforge: "21.1.77" });
    expect(
      mrpackDependencies({
        version: { id: "1.21.1" } as never,
        loader: { name: "vanilla", mods: [] },
      }),
    ).toEqual({ minecraft: "1.21.1" });
  });

  it("gives up on loaders the format has no key for", () => {
    for (const name of ["legacy-fabric", "cleanroom", "babric"] as const) {
      expect(
        mrpackDependencies({
          version: { id: "1.12.2" } as never,
          loader: { name, version: { id: "1.0", url: "" }, mods: [] },
        }),
      ).toBeNull();
    }
  });
});

describe("mrpackLinks", () => {
  it("links only enabled files on the Modrinth CDN", () => {
    const cdn = "https://cdn.modrinth.com/data/a/versions/b/x.jar";
    expect(mrpackLinks(project(ProjectType.MOD, Provider.MODRINTH, cdn))).toEqual([
      { path: "mods/x.jar", url: cdn, sha1: "abc", size: 10 },
    ]);
    expect(mrpackLinks(project(ProjectType.SHADER, Provider.MODRINTH, cdn))[0]?.path).toBe(
      "shaderpacks/x.jar",
    );
    expect(mrpackLinks(project(ProjectType.MOD, Provider.CURSEFORGE, "https://edge.forgecdn.net/x.jar"))).toEqual([]);
    expect(mrpackLinks(project(ProjectType.MOD, Provider.MODRINTH, "https://example.com/x.jar"))).toEqual([]);
    expect(mrpackLinks(project(ProjectType.PLUGIN, Provider.MODRINTH, cdn))).toEqual([]);

    const disabled = project(ProjectType.MOD, Provider.MODRINTH, cdn);
    disabled.version!.files[0].disabled = true;
    expect(mrpackLinks(disabled)).toEqual([]);
  });
});

describe("keepSelectedProjects", () => {
  it("drops projects whose folder was left out", () => {
    const mods = [
      project(ProjectType.MOD, Provider.MODRINTH, ""),
      project(ProjectType.SHADER, Provider.MODRINTH, ""),
      project(ProjectType.WORLD, Provider.CURSEFORGE, ""),
    ];
    expect(keepSelectedProjects(mods, new Set(["mods"])).map((mod) => mod.projectType)).toEqual([
      ProjectType.MOD,
      ProjectType.WORLD,
    ]);
  });
});

describe("buildMrpackIndex", () => {
  it("leaves out an empty summary", () => {
    expect(buildMrpackIndex({ name: "P", description: " ", build: 0 }, { minecraft: "1.21" }, [])).toEqual({
      formatVersion: 1,
      game: "minecraft",
      versionId: "1",
      name: "P",
      files: [],
      dependencies: { minecraft: "1.21" },
    });
  });
});
