import { describe, expect, it } from "vitest";
import {
  DependencyType,
  ILocalProject,
  IVersion as ModVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import type { UpdateState } from "@renderer/features/mods/updates";
import {
  countPort,
  fallbackLoaderFor,
  localPathKey,
  missingRequiredDependencies,
  pickLoaderVersion,
  planPort,
  portedProjects,
  renameResourcePacks,
  renamedFiles,
} from "./portPlan";

function mod(
  id: string,
  options: Partial<ILocalProject> & { filename?: string } = {},
): ILocalProject {
  const { filename, ...rest } = options;
  return {
    title: id,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    id,
    version: {
      id: `${id}-old`,
      files: [
        {
          filename: filename ?? `${id}-old.jar`,
          size: 1,
          sha1: "",
          url: `https://cdn/${id}-old.jar`,
          isServer: false,
        },
      ],
      dependencies: [],
    },
    ...rest,
  };
}

function version(id: string, dependencies: string[] = []): ModVersion {
  return {
    id: `${id}-new`,
    name: id,
    downloads: 0,
    files: [
      {
        filename: `${id}-new.jar`,
        size: 2,
        sha1: "",
        url: `https://cdn/${id}-new.jar`,
        isServer: false,
      },
    ],
    dependencies: dependencies.map((projectId) => ({
      projectId,
      versionId: null,
      project: null,
      relationType: DependencyType.REQUIRED,
    })),
  };
}

const update = (latest: ModVersion): UpdateState => ({ status: "update", latest });
const unavailable: UpdateState = { status: "unavailable", latest: null };
const unknown: UpdateState = { status: "unknown", latest: null };

const empty = {
  disabled: new Set<string>(),
  categories: new Map<string, string[]>(),
  localPaths: new Map<string, string>(),
  includeWorlds: false,
};

describe("planPort", () => {
  it("moves found mods to their new version and keeps them switched off", () => {
    const items = planPort({
      ...empty,
      mods: [mod("sodium")],
      primary: new Map([["modrinth:sodium", update(version("sodium"))]]),
      disabled: new Set(["modrinth:sodium"]),
    });

    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("updated");
    expect(items[0].project?.version?.id).toBe("sodium-new");
    expect(items[0].project?.version?.files[0]).toMatchObject({
      filename: "sodium-new.jar",
      disabled: true,
    });
  });

  it("finds a Fabric build for Quilt and marks the loader it came through", () => {
    const items = planPort({
      ...empty,
      mods: [mod("modmenu")],
      primary: new Map([["modrinth:modmenu", unavailable]]),
      fallback: new Map([["modrinth:modmenu", update(version("modmenu"))]]),
      fallbackLoader: "fabric",
    });

    expect(items[0]).toMatchObject({ status: "updated", viaLoader: "fabric" });
    expect(items[0].project?.loader).toBe("fabric");
  });

  it("tells libraries apart from mods that have no version", () => {
    const items = planPort({
      ...empty,
      mods: [mod("fabric-api"), mod("waystones")],
      primary: new Map([
        ["modrinth:fabric-api", unavailable],
        ["modrinth:waystones", unavailable],
      ]),
      categories: new Map([["modrinth:fabric-api", ["library"]]]),
    });

    expect(items.map((item) => item.status)).toEqual(["library", "missing"]);
    expect(portedProjects(items)).toEqual([]);
  });

  it("does not move what could not be checked or local mods", () => {
    const items = planPort({
      ...empty,
      mods: [
        mod("lithium"),
        mod("mine", { provider: Provider.LOCAL }),
      ],
      primary: new Map([["modrinth:lithium", unknown]]),
    });

    expect(items.map((item) => item.status)).toEqual(["unchecked", "localMod"]);
  });

  it("copies packs as they are when there is no newer build", () => {
    const pack = mod("faithful", { projectType: ProjectType.RESOURCEPACK });
    const local = mod("own", {
      provider: Provider.LOCAL,
      projectType: ProjectType.SHADER,
      filename: "own.zip",
    });
    local.version!.files[0].url = "";

    const items = planPort({
      ...empty,
      mods: [pack, local],
      primary: new Map([["modrinth:faithful", unavailable]]),
      localPaths: new Map([
        [localPathKey("modrinth:faithful", "faithful-old.jar"), "C:/old/rp/faithful-old.jar"],
        [localPathKey("local:own", "own.zip"), "C:/old/shaderpacks/own.zip"],
      ]),
    });

    expect(items.map((item) => item.status)).toEqual(["kept", "kept"]);
    expect(items[1].project?.version?.files[0].localPath).toBe(
      "C:/old/shaderpacks/own.zip",
    );
  });

  it("drops a local pack whose file is gone and skips plugins and worlds", () => {
    const local = mod("gone", {
      provider: Provider.LOCAL,
      projectType: ProjectType.RESOURCEPACK,
    });
    local.version!.files[0].url = "";

    const items = planPort({
      ...empty,
      mods: [
        local,
        mod("plugin", { projectType: ProjectType.PLUGIN }),
        mod("map", { projectType: ProjectType.WORLD }),
      ],
      primary: new Map(),
    });

    expect(items.map((item) => item.status)).toEqual(["missing"]);
  });
});

describe("missingRequiredDependencies", () => {
  it("lists required projects that are not moved along", () => {
    const items = planPort({
      ...empty,
      mods: [mod("iris"), mod("sodium")],
      primary: new Map([
        ["modrinth:iris", update(version("iris", ["sodium", "indium"]))],
        ["modrinth:sodium", update(version("sodium"))],
      ]),
    });

    const missing = missingRequiredDependencies(items);
    expect([...missing.keys()]).toEqual(["modrinth:iris"]);
    expect(missing.get("modrinth:iris")?.projectIds).toEqual(["indium"]);
  });
});

describe("fallbackLoaderFor", () => {
  it("lets Quilt use Fabric builds and NeoForge 1.20.1 use Forge builds", () => {
    expect(fallbackLoaderFor("quilt", "1.21.1")).toBe("fabric");
    expect(fallbackLoaderFor("neoforge", "1.20.1")).toBe("forge");
    expect(fallbackLoaderFor("neoforge", "1.21.1")).toBeUndefined();
    expect(fallbackLoaderFor("fabric", "1.21.1")).toBeUndefined();
  });
});

describe("pickLoaderVersion", () => {
  const version = (id: string) => ({ id, url: "" });

  it("takes the newest stable Quilt build even from an unsorted list", () => {
    expect(
      pickLoaderVersion(
        [version("0.20.0-beta.9"), version("0.26.4"), version("0.29.2-beta.1"), version("0.28.1")],
        "quilt",
      )?.id,
    ).toBe("0.28.1");
  });

  it("keeps the catalog order for Forge-like loaders", () => {
    expect(
      pickLoaderVersion([version("21.1.77"), version("21.1.80")], "neoforge")?.id,
    ).toBe("21.1.77");
    expect(pickLoaderVersion([], "fabric")).toBeUndefined();
  });
});

describe("resource pack renames", () => {
  it("follows new file names into the enabled pack list", () => {
    const pack = mod("faithful", { projectType: ProjectType.RESOURCEPACK });
    const items = planPort({
      ...empty,
      mods: [pack],
      primary: new Map([["modrinth:faithful", update(version("faithful"))]]),
    });
    const renames = renamedFiles([pack], items, ProjectType.RESOURCEPACK);

    expect(
      renameResourcePacks(
        'version:3955\r\nresourcePacks:["vanilla","file/faithful-old.jar"]\r\nlang:ru_ru',
        renames,
      ),
    ).toBe(
      'version:3955\r\nresourcePacks:["vanilla","file/faithful-new.jar"]\r\nlang:ru_ru',
    );
    expect(countPort(items).updated).toBe(1);
  });
});
