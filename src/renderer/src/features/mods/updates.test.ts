import { describe, expect, it } from "vitest";

import {
  applyUpdates,
  collectUnavailable,
  collectUpdatable,
  isCheckableProject,
  planQuickInstall,
  toLocalProject,
  UpdateState,
} from "./updates";
import {
  DependencyType,
  ILocalProject,
  IProject,
  IVersion as ModVersion,
  IVersionDependency,
  ProjectType,
  Provider,
} from "@/types/ModManager";

function version(overrides: Partial<ModVersion> = {}): ModVersion {
  return {
    id: "v1",
    name: "1.0.0",
    dependencies: [],
    downloads: 0,
    files: [
      {
        filename: "mod.jar",
        size: 1,
        sha1: "sha",
        url: "https://example.test/mod.jar",
        isServer: true,
        isClient: true,
      },
    ],
    ...overrides,
  };
}

function localMod(overrides: Partial<ILocalProject> = {}): ILocalProject {
  return {
    id: "id",
    provider: Provider.MODRINTH,
    title: "Title",
    description: "desc",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    version: { id: "v1", dependencies: [], files: [] },
    ...overrides,
  };
}

function project(overrides: Partial<IProject> = {}): IProject {
  return {
    id: "p1",
    provider: Provider.MODRINTH,
    title: "Project",
    description: "desc",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    versions: [],
    gallery: [],
    body: "",
    ...overrides,
  };
}

describe("isCheckableProject", () => {
  it("accepts remote providers only", () => {
    expect(isCheckableProject(localMod({ provider: Provider.MODRINTH }))).toBe(true);
    expect(isCheckableProject(localMod({ provider: Provider.CURSEFORGE }))).toBe(true);
    expect(isCheckableProject(localMod({ provider: Provider.LOCAL }))).toBe(false);
    expect(isCheckableProject(localMod({ provider: Provider.OTHER }))).toBe(false);
  });
});

describe("collect helpers", () => {
  const states = new Map<string, UpdateState>([
    ["a", { status: "update", latest: version() }],
    ["b", { status: "current", latest: version() }],
    ["c", { status: "unavailable", latest: null }],
  ]);

  it("splits updatable and unavailable keys", () => {
    expect([...collectUpdatable(states)]).toEqual(["a"]);
    expect([...collectUnavailable(states)]).toEqual(["c"]);
  });
});

describe("toLocalProject", () => {
  it("maps a catalog project and version into an installed entry", () => {
    const result = toLocalProject(project(), version({ id: "v5" }));

    expect(result.id).toBe("p1");
    expect(result.version?.id).toBe("v5");
    expect(result.version?.files[0].localPath).toBeUndefined();
    expect(result.version?.files[0].disabled).toBeUndefined();
  });

  it("keeps the disabled flag when asked", () => {
    const result = toLocalProject(project(), version(), { disabled: true });
    expect(result.version?.files.every((file) => file.disabled)).toBe(true);
  });

  it("maps dependencies down to titles and ids", () => {
    const dependency: IVersionDependency = {
      projectId: "dep",
      versionId: null,
      relationType: DependencyType.REQUIRED,
      project: project({ id: "dep", title: "Fabric API" }),
    };

    const result = toLocalProject(project(), version({ dependencies: [dependency] }));

    expect(result.version?.dependencies).toEqual([
      { title: "Fabric API", projectId: "dep", relationType: DependencyType.REQUIRED },
    ]);
  });
});

describe("applyUpdates", () => {
  it("replaces only the versions that have an update", () => {
    const mods = [localMod({ id: "a" }), localMod({ id: "b" })];
    const { mods: next, updated } = applyUpdates(
      mods,
      new Map([[`${Provider.MODRINTH}:a`, version({ id: "v9" })]]),
      new Set(),
    );

    expect(updated).toBe(1);
    expect(next[0].version?.id).toBe("v9");
    expect(next[1]).toBe(mods[1]);
  });

  it("keeps the disabled state of an updated mod", () => {
    const { mods: next } = applyUpdates(
      [localMod({ id: "a" })],
      new Map([[`${Provider.MODRINTH}:a`, version()]]),
      new Set([`${Provider.MODRINTH}:a`]),
    );

    expect(next[0].version?.files.every((file) => file.disabled)).toBe(true);
  });
});

describe("planQuickInstall", () => {
  const fabricApi = project({ id: "api", title: "Fabric API" });

  function fetchers(map: Record<string, ModVersion[]>) {
    return {
      fetchVersions: async (item: IProject) => map[item.id] ?? [],
      fetchDependencies: async (_item: IProject, deps: IVersionDependency[]) => deps,
    };
  }

  it("adds the root project", async () => {
    const plan = await planQuickInstall(
      project(),
      [],
      fetchers({ p1: [version({ id: "v1" })] }),
    );

    expect(plan.rootMissingVersion).toBe(false);
    expect(plan.added.map((item) => item.id)).toEqual(["p1"]);
  });

  it("walks required dependencies breadth-first", async () => {
    const dependency: IVersionDependency = {
      projectId: "api",
      versionId: null,
      relationType: DependencyType.REQUIRED,
      project: fabricApi,
    };

    const plan = await planQuickInstall(
      project(),
      [],
      fetchers({
        p1: [version({ id: "v1", dependencies: [dependency] })],
        api: [version({ id: "apiv1" })],
      }),
    );

    expect(plan.added.map((item) => item.id)).toEqual(["p1", "api"]);
  });

  it("skips optional and incompatible dependencies", async () => {
    const optional: IVersionDependency = {
      projectId: "api",
      versionId: null,
      relationType: DependencyType.OPTIONAL,
      project: fabricApi,
    };

    const plan = await planQuickInstall(
      project(),
      [],
      fetchers({ p1: [version({ dependencies: [optional] })], api: [version()] }),
    );

    expect(plan.added.map((item) => item.id)).toEqual(["p1"]);
  });

  it("skips what is already installed, by id and by title", async () => {
    const dependency: IVersionDependency = {
      projectId: "api",
      versionId: null,
      relationType: DependencyType.REQUIRED,
      project: fabricApi,
    };

    const plan = await planQuickInstall(
      project(),
      [localMod({ id: "unrelated", title: "Fabric API" })],
      fetchers({ p1: [version({ dependencies: [dependency] })], api: [version()] }),
    );

    expect(plan.added.map((item) => item.id)).toEqual(["p1"]);
  });

  it("flags a root without a compatible version", async () => {
    const plan = await planQuickInstall(project(), [], fetchers({}));

    expect(plan.added).toHaveLength(0);
    expect(plan.rootMissingVersion).toBe(true);
  });

  it("does not loop on circular dependencies", async () => {
    const toApi: IVersionDependency = {
      projectId: "api",
      versionId: null,
      relationType: DependencyType.REQUIRED,
      project: fabricApi,
    };
    const toRoot: IVersionDependency = {
      projectId: "p1",
      versionId: null,
      relationType: DependencyType.REQUIRED,
      project: project(),
    };

    const plan = await planQuickInstall(
      project(),
      [],
      fetchers({
        p1: [version({ dependencies: [toApi] })],
        api: [version({ dependencies: [toRoot] })],
      }),
    );

    expect(plan.added.map((item) => item.id)).toEqual(["p1", "api"]);
  });
});
