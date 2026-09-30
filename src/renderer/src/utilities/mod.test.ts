import { describe, expect, it } from "vitest";

import {
  buildInstalledIndex,
  findInstalledProject,
  normalizeProjectTitle,
  planDeletion,
} from "./mod";
import { DependencyType, ProjectType, Provider } from "@/types/ModManager";
import type { ILocalProject } from "@/types/ModManager";

function localMod(overrides: Partial<ILocalProject>): ILocalProject {
  return {
    id: "id",
    provider: Provider.MODRINTH,
    title: "Title",
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    version: {
      id: "version",
      dependencies: [],
      files: [],
    },
    ...overrides,
  } as ILocalProject;
}

describe("deletion with JAR dependencies", () => {
  const withFile = (id: string) =>
    localMod({
      id,
      title: id,
      provider: Provider.CURSEFORGE,
      version: {
        id: "v",
        dependencies: [],
        files: [
          { filename: `${id}.jar`, size: 0, sha1: "", url: "", isServer: true },
        ],
      },
    });
  it("finds an imported mod chain even when all catalog dependencies are empty", () => {
    const mods = [withFile("library"), withFile("mod"), withFile("addon")];
    const localDependencies = {
      "library.jar": { provides: ["native_library"], requires: [] },
      "mod.jar": { provides: ["native_mod"], requires: ["native_library"] },
      "addon.jar": { provides: ["native_addon"], requires: ["native_mod"] },
    };
    expect(planDeletion(mods, mods[0], { localDependencies }).blockers).toEqual(
      [mods[1]],
    );
    expect(
      planDeletion(mods, mods[0], {
        localDependencies,
        includeDependents: true,
      }).remove,
    ).toEqual(mods);
  });
  it("retains a native library needed by another installed mod", () => {
    const mods = [withFile("library"), withFile("mod"), withFile("other")];
    const localDependencies = {
      "library.jar": { provides: ["lib"], requires: [] },
      "mod.jar": { provides: ["mod"], requires: ["lib"] },
      "other.jar": { provides: ["other"], requires: ["lib"] },
    };
    expect(planDeletion(mods, mods[1], { localDependencies }).remove).toEqual([
      mods[1],
    ]);
  });
  it("checks each provided native id separately when a JAR bundles several mods", () => {
    const mods = [withFile("bundle"), withFile("replacement"), withFile("mod")];
    const localDependencies = {
      "bundle.jar": { provides: ["first", "second"], requires: [] },
      "replacement.jar": { provides: ["first"], requires: [] },
      "mod.jar": { provides: ["mod"], requires: ["second"] },
    };
    expect(planDeletion(mods, mods[0], { localDependencies }).blockers).toEqual(
      [mods[2]],
    );
    localDependencies["mod.jar"].requires = ["first"];
    expect(planDeletion(mods, mods[0], { localDependencies }).blockers).toEqual(
      [],
    );
  });
});

describe("normalizeProjectTitle", () => {
  it("collapses case, punctuation and loader suffixes to the same key", () => {
    const expected = "justenoughitems";
    expect(normalizeProjectTitle("Just Enough Items")).toBe(expected);
    expect(normalizeProjectTitle("Just Enough Items (JEI)")).toBe(expected);
    expect(normalizeProjectTitle("just-enough-items")).toBe(expected);
    expect(normalizeProjectTitle("Just Enough Items [Fabric]")).toBe(expected);
  });

  it("strips diacritics", () => {
    expect(normalizeProjectTitle("Café Mod")).toBe(
      normalizeProjectTitle("Cafe Mod"),
    );
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeProjectTitle("")).toBe("");
    expect(normalizeProjectTitle("()")).toBe("");
  });
});

describe("findInstalledProject", () => {
  it("matches the same mod across providers by normalized title", () => {
    const modrinthJei = localMod({
      id: "u6dRKJwZ",
      provider: Provider.MODRINTH,
      title: "Just Enough Items",
    });
    const index = buildInstalledIndex([modrinthJei]);

    const curseForgeJei = {
      id: "238222",
      provider: Provider.CURSEFORGE,
      title: "Just Enough Items (JEI)",
    };

    expect(findInstalledProject(index, curseForgeJei)).toBe(modrinthJei);
  });

  it("prefers an exact provider + id match", () => {
    const a = localMod({
      id: "1",
      provider: Provider.CURSEFORGE,
      title: "Sodium",
    });
    const b = localMod({
      id: "2",
      provider: Provider.MODRINTH,
      title: "Sodium",
    });
    const index = buildInstalledIndex([a, b]);

    expect(
      findInstalledProject(index, {
        id: "2",
        provider: Provider.MODRINTH,
        title: "Sodium",
      }),
    ).toBe(b);
  });

  it("matches by shared file sha1", () => {
    const installed = localMod({
      id: "local",
      provider: Provider.LOCAL,
      title: "Some Renamed File",
      version: {
        id: "v",
        dependencies: [],
        files: [
          { filename: "a.jar", sha1: "abc", size: 1, url: "", isServer: true },
        ],
      },
    });
    const index = buildInstalledIndex([installed]);

    expect(
      findInstalledProject(index, {
        id: "different",
        provider: Provider.MODRINTH,
        title: "Totally Different Name",
        version: { files: [{ sha1: "abc" }] },
      }),
    ).toBe(installed);
  });

  it("returns undefined when nothing matches", () => {
    const index = buildInstalledIndex([localMod({ id: "1", title: "Sodium" })]);

    expect(
      findInstalledProject(index, {
        id: "999",
        provider: Provider.CURSEFORGE,
        title: "Iris Shaders",
      }),
    ).toBeUndefined();
  });
});

function modWithDeps(
  id: string,
  title: string,
  deps: Array<{
    title: string;
    projectId?: string;
    relationType?: DependencyType;
  }> = [],
): ILocalProject {
  return localMod({
    id,
    title,
    version: {
      id: `${id}-v`,
      files: [],
      dependencies: deps.map((d) => ({
        title: d.title,
        projectId: d.projectId,
        relationType: d.relationType ?? DependencyType.REQUIRED,
      })),
    },
  });
}

const titles = (mods: ILocalProject[]) => mods.map((m) => m.title).sort();

describe("planDeletion", () => {
  it("lets one of two copies of a mod go without blocking or cascading", () => {
    const terra = (provider: Provider, id: string, title: string) =>
      localMod({
        id,
        provider,
        title,
        version: {
          id: `${id}-v`,
          dependencies: [],
          files: [
            {
              filename: "TerraBlender-neoforge-1.21.1-4.1.0.8.jar",
              size: 1,
              url: "",
              sha1: "",
              isServer: true,
            },
          ],
        },
      });
    const local = terra(Provider.LOCAL, "terrablender", "TerraBlender");
    const catalog = terra(
      Provider.CURSEFORGE,
      "563928",
      "TerraBlender (NeoForge)",
    );
    const user = modWithDeps("biomes", "Biomes", [{ title: "TerraBlender" }]);

    const plan = planDeletion([local, catalog, user], local);

    expect(plan.remove).toEqual([local]);
    expect(plan.blockers).toEqual([]);
  });

  it("removes the mod and its orphaned required dependencies", () => {
    const a = modWithDeps("a", "Top", [{ title: "Lib" }]);
    const b = modWithDeps("b", "Lib");
    const plan = planDeletion([a, b], a);

    expect(titles(plan.remove)).toEqual(["Lib", "Top"]);
    expect(plan.blockers).toEqual([]);
  });

  it("keeps a dependency that another kept mod still requires", () => {
    const a = modWithDeps("a", "Top", [{ title: "Lib" }]);
    const b = modWithDeps("b", "Lib");
    const c = modWithDeps("c", "Other", [{ title: "Lib" }]);
    const plan = planDeletion([a, b, c], a);

    expect(titles(plan.remove)).toEqual(["Top"]);
    expect(plan.blockers).toEqual([]);
  });

  it("blocks deleting a dependency that a kept mod requires", () => {
    const a = modWithDeps("a", "Top", [{ title: "Lib" }]);
    const b = modWithDeps("b", "Lib");
    const plan = planDeletion([a, b], b);

    expect(titles(plan.remove)).toEqual(["Lib"]);
    expect(titles(plan.blockers)).toEqual(["Top"]);
  });

  it("breaks the deadlock of two mutually-required mods", () => {
    const a = modWithDeps("a", "Alpha", [{ title: "Beta" }]);
    const b = modWithDeps("b", "Beta", [{ title: "Alpha" }]);

    const planA = planDeletion([a, b], a);
    expect(titles(planA.remove)).toEqual(["Alpha", "Beta"]);
    expect(planA.blockers).toEqual([]);

    const planB = planDeletion([a, b], b);
    expect(titles(planB.remove)).toEqual(["Alpha", "Beta"]);
    expect(planB.blockers).toEqual([]);
  });

  it("does not let optional dependents block deletion", () => {
    const a = modWithDeps("a", "Top", [
      { title: "Lib", relationType: DependencyType.OPTIONAL },
    ]);
    const b = modWithDeps("b", "Lib");
    const plan = planDeletion([a, b], b);

    expect(titles(plan.remove)).toEqual(["Lib"]);
    expect(plan.blockers).toEqual([]);
  });

  it("matches dependency edges across provider title differences", () => {
    const a = modWithDeps("a", "Top", [{ title: "Just Enough Items (JEI)" }]);
    const b = modWithDeps("b", "Just Enough Items");
    const plan = planDeletion([a, b], a);

    expect(titles(plan.remove)).toEqual(["Just Enough Items", "Top"]);
  });
});

describe("planDeletion without dependency titles", () => {
  it("still links dependencies when only the project id survives", () => {
    const lib = modWithDeps("lib-id", "Fabric API");
    const top = modWithDeps("top-id", "Top", [
      { title: "", projectId: "lib-id" },
    ]);

    const plan = planDeletion([top, lib], top);

    expect(titles(plan.remove)).toEqual(["Fabric API", "Top"]);
  });

  it("warns about dependants resolved by project id", () => {
    const lib = modWithDeps("lib-id", "Fabric API");
    const top = modWithDeps("top-id", "Top", [
      { title: "", projectId: "lib-id" },
    ]);

    const plan = planDeletion([top, lib], lib);

    expect(titles(plan.blockers)).toEqual(["Top"]);
  });

  it("keeps a shared dependency that another mod still needs", () => {
    const lib = modWithDeps("lib-id", "Fabric API");
    const first = modWithDeps("a", "First", [
      { title: "", projectId: "lib-id" },
    ]);
    const second = modWithDeps("b", "Second", [
      { title: "", projectId: "lib-id" },
    ]);

    const plan = planDeletion([first, second, lib], first);

    expect(titles(plan.remove)).toEqual(["First"]);
  });
});

describe("deletion recovery", () => {
  it("plans bulk removal together regardless of selection order", () => {
    const lib = modWithDeps("lib", "Lib");
    const user = modWithDeps("user", "User", [{ title: "Lib" }]);
    for (const targets of [
      [lib, user],
      [user, lib],
    ]) {
      const plan = planDeletion([lib, user], targets);
      expect(titles(plan.remove)).toEqual(["Lib", "User"]);
      expect(plan.blockers).toEqual([]);
    }
  });

  it("lets the user remove only the selected crashing mod", () => {
    const connector = modWithDeps("connector", "Sinytra Connector");
    const api = modWithDeps("api", "Forgified Fabric API", [
      { title: connector.title },
    ]);
    const plan = planDeletion([connector, api], connector, {
      removeDependencies: false,
    });
    expect(plan.remove).toEqual([connector]);
    expect(plan.blockers).toEqual([api]);
  });

  it("includes all transitive dependents without removing shared libraries", () => {
    const lib = modWithDeps("lib", "Lib");
    const a = modWithDeps("a", "A", [{ title: "Lib" }]);
    const b = modWithDeps("b", "B", [{ title: "A" }, { title: "Shared" }]);
    const c = modWithDeps("c", "C", [{ title: "B" }]);
    const other = modWithDeps("other", "Other", [{ title: "Shared" }]);
    const shared = modWithDeps("shared", "Shared");
    const optional = modWithDeps("optional", "Optional", [
      { title: "Lib", relationType: DependencyType.OPTIONAL },
    ]);
    const plan = planDeletion([lib, a, b, c, other, shared, optional], lib, {
      includeDependents: true,
    });
    expect(titles(plan.remove)).toEqual(["A", "B", "C", "Lib"]);
    expect(plan.blockers).toEqual([]);
  });

  it("handles a three-node dependency cycle", () => {
    const a = modWithDeps("a", "A", [{ title: "B" }]);
    const b = modWithDeps("b", "B", [{ title: "C" }]);
    const c = modWithDeps("c", "C", [{ title: "A" }]);
    const plan = planDeletion([a, b, c], a);
    expect(titles(plan.remove)).toEqual(["A", "B", "C"]);
    expect(plan.blockers).toEqual([]);
  });

  it("retains a cyclic library component used by another mod", () => {
    const top = modWithDeps("top", "Top", [{ title: "B" }]);
    const b = modWithDeps("b", "B", [{ title: "C" }]);
    const c = modWithDeps("c", "C", [{ title: "B" }]);
    const other = modWithDeps("other", "Other", [{ title: "C" }]);
    const plan = planDeletion([top, b, c, other], top);
    expect(plan.remove).toEqual([top]);
    expect(plan.blockers).toEqual([]);
  });

  it("resolves ids within the owner's provider and content type", () => {
    const resourcepack = {
      ...modWithDeps("lib", "Pack"),
      projectType: ProjectType.RESOURCEPACK,
    };
    const curseforge = {
      ...modWithDeps("lib", "CF Lib"),
      provider: Provider.CURSEFORGE,
    };
    const lib = modWithDeps("lib", "MR Lib");
    const user = modWithDeps("user", "User", [{ title: "", projectId: "lib" }]);
    const mods = [resourcepack, curseforge, lib, user];
    expect(planDeletion(mods, lib).blockers).toEqual([user]);
    expect(planDeletion(mods, curseforge).blockers).toEqual([]);
    expect(titles(planDeletion(mods, user).remove)).toEqual(["MR Lib", "User"]);
  });
});
