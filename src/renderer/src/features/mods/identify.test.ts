import { describe, expect, it } from "vitest";
import {
  ILocalIdentifyMatch,
  ILocalProject,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { foreignLoader, linkIdentified } from "./identify";

function local(id: string, filename: string, extra: Partial<ILocalProject> = {}): ILocalProject {
  return {
    title: id,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.LOCAL,
    id,
    version: {
      id: "1",
      dependencies: [],
      files: [
        {
          filename,
          size: 10,
          sha1: "a".repeat(40),
          url: `file:///C:/mods/${filename}`,
          isServer: true,
        },
      ],
    },
    ...extra,
  };
}

function match(key: string, projectId: string, provider = Provider.MODRINTH): ILocalIdentifyMatch {
  return {
    key,
    provider: provider as ILocalIdentifyMatch["provider"],
    loaders: ["fabric"],
    project: {
      id: projectId,
      title: "Sodium",
      description: "Fast",
      projectType: ProjectType.MOD,
      iconUrl: "https://cdn/icon.png",
      url: "https://modrinth.com/mod/sodium",
      provider,
      versions: [],
      gallery: [],
      body: "",
    },
    version: {
      id: "v5",
      name: "Sodium 0.6",
      dependencies: [],
      downloads: 1,
      files: [
        {
          filename: "sodium-fabric-0.6.jar",
          size: 10,
          sha1: "a".repeat(40),
          url: "https://cdn/sodium-fabric-0.6.jar",
          isServer: false,
          isClient: true,
        },
      ],
    },
  };
}

describe("linkIdentified", () => {
  it("turns a local mod into its catalog project without renaming the file", () => {
    const mods = [local("sodium", "sodium.jar", { updatedAt: "2026-01-01T00:00:00.000Z" })];

    const { mods: next, linked } = linkIdentified(
      mods,
      [match("local:sodium", "AANobbMI")],
      new Set(),
    );

    expect(linked).toEqual(["local:sodium"]);
    expect(next[0]).toMatchObject({
      provider: Provider.MODRINTH,
      id: "AANobbMI",
      title: "Sodium",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(next[0].version?.id).toBe("v5");
    expect(next[0].version?.files[0]).toMatchObject({
      filename: "sodium.jar",
      url: "https://cdn/sodium-fabric-0.6.jar",
      sha1: "a".repeat(40),
    });
  });

  it("remembers where the file is when the catalog will not serve it", () => {
    const blocked = match("local:sodium", "394468", Provider.CURSEFORGE);
    blocked.version.files[0].url = "blocked::https://www.curseforge.com/minecraft/mc-mods/x/download/1";

    const { mods: next } = linkIdentified(
      [local("sodium", "sodium.jar")],
      [blocked],
      new Set(),
    );

    expect(next[0].version?.files[0].localPath).toBe("C:/mods/sodium.jar");
  });

  it("keeps a disabled mod disabled", () => {
    const { mods: next } = linkIdentified(
      [local("sodium", "sodium.jar")],
      [match("local:sodium", "AANobbMI")],
      new Set(["local:sodium"]),
    );

    expect(next[0].version?.files[0].disabled).toBe(true);
  });

  it("does not create a second copy of a project that is already installed", () => {
    const installed = { ...local("AANobbMI", "sodium-new.jar"), provider: Provider.MODRINTH };
    const mods = [installed, local("sodium", "sodium.jar"), local("sodium-copy", "copy.jar")];

    const { mods: next, linked } = linkIdentified(
      mods,
      [match("local:sodium", "AANobbMI"), match("local:sodium-copy", "AANobbMI")],
      new Set(),
    );

    expect(linked).toEqual([]);
    expect(next).toEqual(mods);
  });

  it("links only the first of two local copies of the same project", () => {
    const mods = [local("sodium", "sodium.jar"), local("sodium-copy", "copy.jar")];

    const { linked } = linkIdentified(
      mods,
      [match("local:sodium", "AANobbMI"), match("local:sodium-copy", "AANobbMI")],
      new Set(),
    );

    expect(linked).toEqual(["local:sodium"]);
  });

  it("folds a local mod into the catalog entry that already owns its file", () => {
    const owner = {
      ...local("419699", "architectury-13.0.11-neoforge.jar"),
      provider: Provider.CURSEFORGE,
      title: "Architectury API",
    };
    const mods = [
      local("architectury", "architectury-13.0.11-neoforge.jar"),
      owner,
    ];

    const { mods: next, linked } = linkIdentified(
      mods,
      [match("local:architectury", "lhGA9TYQ")],
      new Set(),
    );

    expect(linked).toEqual(["local:architectury"]);
    expect(next).toEqual([owner]);
  });
});

describe("foreignLoader", () => {
  it("marks a Fabric build installed into a NeoForge instance", () => {
    expect(foreignLoader(["fabric"], "neoforge")).toBe("fabric");
    expect(foreignLoader(["fabric", "quilt"], "forge")).toBe("fabric");
  });

  it("leaves native and loader-less files alone", () => {
    expect(foreignLoader(["neoforge"], "neoforge")).toBeUndefined();
    expect(foreignLoader(["NeoForge", "Fabric"], "neoforge")).toBeUndefined();
    expect(foreignLoader(["minecraft"], "neoforge")).toBeUndefined();
    expect(foreignLoader([], "fabric")).toBeUndefined();
    expect(foreignLoader(["fabric"], undefined)).toBeUndefined();
  });

  it("carries the loader onto the linked mod", () => {
    const { mods } = linkIdentified(
      [local("sodium", "sodium.jar")],
      [match("local:sodium", "AANobbMI")],
      new Set(),
      "neoforge",
    );

    expect(mods[0].loader).toBe("fabric");
  });
});
