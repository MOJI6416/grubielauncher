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
  deps: Array<{ title: string; relationType?: DependencyType }> = [],
): ILocalProject {
  return localMod({
    id,
    title,
    version: {
      id: `${id}-v`,
      files: [],
      dependencies: deps.map((d) => ({
        title: d.title,
        relationType: d.relationType ?? DependencyType.REQUIRED,
      })),
    },
  });
}

const titles = (mods: ILocalProject[]) => mods.map((m) => m.title).sort();

describe("planDeletion", () => {
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
