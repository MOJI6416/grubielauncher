import { describe, expect, it } from "vitest";
import { IVersion, ProjectType, Provider } from "@/types/ModManager";
import {
  IWorldSource,
  parseWorldSource,
  planWorldPublish,
  sourceKey,
  worldSourceOf,
} from "./worldSource";

function source(projectId: string, fileId: string): IWorldSource {
  return {
    provider: "curseforge",
    projectId,
    fileId,
    filename: `${projectId}-${fileId}.zip`,
    title: `Map ${projectId}`,
    url: `https://www.curseforge.com/minecraft/worlds/map-${projectId}`,
    iconUrl: null,
  };
}

function version(id: string, filename: string, url = `https://edge.forgecdn.net/files/${id}/${filename}`): IVersion {
  return {
    id,
    name: filename,
    dependencies: [],
    downloads: 0,
    files: [{ filename, url, sha1: "abc", size: 10, isServer: false }],
  };
}

describe("world source marker", () => {
  it("accepts only complete CurseForge sources", () => {
    expect(parseWorldSource(source("1", "2"))).toEqual(source("1", "2"));
    expect(parseWorldSource({ ...source("1", "2"), provider: "modrinth" })).toBeNull();
    expect(parseWorldSource({ provider: "curseforge", projectId: "1" })).toBeNull();
    expect(parseWorldSource("not json")).toBeNull();
    expect(
      parseWorldSource({ provider: "curseforge", projectId: "1", fileId: "2", filename: "m.zip" }),
    ).toMatchObject({ title: "m.zip", url: "", iconUrl: null });
  });

  it("is written only for CurseForge installs", () => {
    const project = {
      provider: Provider.CURSEFORGE,
      id: "77",
      title: "Skyblock",
      url: "https://www.curseforge.com/minecraft/worlds/skyblock",
      iconUrl: "https://media.forgecdn.net/icon.png",
    };
    expect(worldSourceOf(project, "900", { filename: "skyblock.zip" })).toEqual({
      provider: "curseforge",
      projectId: "77",
      fileId: "900",
      filename: "skyblock.zip",
      title: "Skyblock",
      url: project.url,
      iconUrl: project.iconUrl,
    });
    expect(worldSourceOf({ ...project, provider: Provider.LOCAL }, "900", { filename: "a.zip" })).toBeNull();
    expect(worldSourceOf(project, undefined, { filename: "a.zip" })).toBeNull();
  });
});

describe("publishing worlds as links or in the archive", () => {
  it("links maps whose CurseForge file is still there and archives the rest", () => {
    const linked = source("10", "100");
    const gone = source("20", "200");
    const blocked = source("30", "300");
    const jarOnly = source("40", "400");

    const plan = planWorldPublish(
      [
        { folder: "Skyblock", source: linked },
        { folder: "My base", source: null },
        { folder: "Deleted map", source: gone },
        { folder: "Blocked map", source: blocked },
        { folder: "Strange map", source: jarOnly },
      ],
      new Map([
        [sourceKey(linked), version("100", "skyblock.zip")],
        [sourceKey(gone), null],
        [sourceKey(blocked), version("300", "blocked.zip", "blocked::https://www.curseforge.com/x")],
        [sourceKey(jarOnly), version("400", "strange.jar")],
      ]),
    );

    expect(plan.archiveFolders).toEqual([
      "My base",
      "Deleted map",
      "Blocked map",
      "Strange map",
    ]);
    expect(plan.links).toHaveLength(1);
    expect(plan.links[0].folder).toBe("Skyblock");
    expect(plan.links[0].entry).toMatchObject({
      provider: Provider.CURSEFORGE,
      projectType: ProjectType.WORLD,
      id: "10",
      title: "Map 10",
      version: {
        id: "100",
        files: [
          {
            filename: "skyblock.zip",
            url: "https://edge.forgecdn.net/files/100/skyblock.zip",
            isServer: true,
            isClient: true,
          },
        ],
      },
    });
  });

  it("sends a map once even when two worlds came from the same file", () => {
    const map = source("10", "100");
    const plan = planWorldPublish(
      [
        { folder: "Skyblock", source: map },
        { folder: "Skyblock (2)", source: map },
      ],
      new Map([[sourceKey(map), version("100", "skyblock.zip")]]),
    );

    expect(plan.links.map((link) => link.folder)).toEqual(["Skyblock"]);
    expect(plan.archiveFolders).toEqual(["Skyblock (2)"]);
  });

  it("archives a source the catalog was not asked about", () => {
    const plan = planWorldPublish(
      [{ folder: "Offline", source: source("50", "500") }],
      new Map(),
    );

    expect(plan).toEqual({ links: [], archiveFolders: ["Offline"] });
  });
});
