import { describe, expect, it } from "vitest";
import {
  DependencyType,
  ILocalProject,
  LocalModDependencyIndex,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { modRelations, planDisable, planEnable } from "./modRelations";

function mod(
  id: string,
  title: string,
  deps: { title: string; type?: DependencyType; projectId?: string }[] = [],
  filename = `${id}.jar`,
): ILocalProject {
  return {
    id,
    provider: Provider.MODRINTH,
    title,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    version: {
      id: `${id}-v`,
      dependencies: deps.map((dep) => ({
        title: dep.title,
        projectId: dep.projectId,
        relationType: dep.type ?? DependencyType.REQUIRED,
      })),
      files: [{ filename, size: 1, url: "", sha1: "", isServer: true }],
    },
  };
}

const titles = (mods: ILocalProject[]) => mods.map((item) => item.title).sort();
const keys = (...mods: ILocalProject[]) =>
  new Set(mods.map((item) => `${item.provider}:${item.id}`));

describe("planDisable", () => {
  it("disables the libraries only the disabled mod needed", () => {
    const top = mod("top", "Top", [{ title: "Lib" }]);
    const lib = mod("lib", "Lib", [{ title: "Core" }]);
    const core = mod("core", "Core");

    const plan = planDisable([top, lib, core], [top], new Set());

    expect(titles(plan.toggle)).toEqual(["Core", "Lib", "Top"]);
    expect(plan.dependents).toEqual([]);
  });

  it("keeps a library another enabled mod still needs", () => {
    const top = mod("top", "Top", [{ title: "Lib" }]);
    const other = mod("other", "Other", [{ title: "Lib" }]);
    const lib = mod("lib", "Lib");

    expect(titles(planDisable([top, other, lib], [top], new Set()).toggle)).toEqual(
      ["Top"],
    );
  });

  it("does not count an already disabled mod as a user of the library", () => {
    const top = mod("top", "Top", [{ title: "Lib" }]);
    const other = mod("other", "Other", [{ title: "Lib" }]);
    const lib = mod("lib", "Lib");

    const plan = planDisable([top, other, lib], [top], keys(other));

    expect(titles(plan.toggle)).toEqual(["Lib", "Top"]);
  });

  it("disables only the library and names who breaks when others need it", () => {
    const top = mod("top", "Top", [{ title: "Lib" }]);
    const lib = mod("lib", "Lib");

    const plan = planDisable([top, lib], [lib], new Set());

    expect(titles(plan.toggle)).toEqual(["Lib"]);
    expect(titles(plan.dependents)).toEqual(["Top"]);
  });

  it("follows dependencies read from the jar files", () => {
    const top = mod("top", "Top", [], "top.jar");
    const lib = mod("lib", "Lib", [], "lib.jar");
    const index: LocalModDependencyIndex = {
      "top.jar": { provides: ["top"], requires: ["libmod"] },
      "lib.jar": { provides: ["libmod"], requires: [] },
    };

    expect(titles(planDisable([top, lib], [top], new Set(), index).toggle)).toEqual(
      ["Lib", "Top"],
    );
  });

  it("does nothing for mods that are already off", () => {
    const top = mod("top", "Top");
    expect(planDisable([top], [top], keys(top))).toEqual({
      toggle: [],
      dependents: [],
    });
  });
});

describe("planEnable", () => {
  it("turns the disabled dependency chain back on", () => {
    const top = mod("top", "Top", [{ title: "Lib" }]);
    const lib = mod("lib", "Lib", [{ title: "Core" }]);
    const core = mod("core", "Core");

    expect(titles(planEnable([top, lib, core], [top], keys(top, lib, core)))).toEqual(
      ["Core", "Lib", "Top"],
    );
  });

  it("leaves enabled dependencies and unrelated mods alone", () => {
    const top = mod("top", "Top", [{ title: "Lib" }]);
    const lib = mod("lib", "Lib");
    const other = mod("other", "Other");

    expect(titles(planEnable([top, lib, other], [top], keys(top, other)))).toEqual([
      "Top",
    ]);
  });
});

describe("modRelations", () => {
  it("lists what a mod needs, who needs it, what it embeds and what it conflicts with", () => {
    const top = mod("top", "Top", [
      { title: "Lib" },
      { title: "Extras", type: DependencyType.OPTIONAL },
      { title: "OldRenderer", type: DependencyType.INCOMPATIBLE },
    ]);
    const lib = mod("lib", "Lib", [], "lib.jar");
    const fan = mod("fan", "Fan", [{ title: "Top" }]);
    const renderer = mod("old", "OldRenderer");
    const hater = mod("hater", "Hater", [
      { title: "Lib", type: DependencyType.INCOMPATIBLE },
    ]);
    const index: LocalModDependencyIndex = {
      "lib.jar": { provides: ["lib"], requires: [], embedded: ["mixinextras"] },
    };

    const forTop = modRelations([top, lib, fan, renderer, hater], top, index);
    expect(titles(forTop.requires)).toEqual(["Lib"]);
    expect(titles(forTop.requiredBy)).toEqual(["Fan"]);
    expect(forTop.optional.map((item) => item.title)).toEqual(["Extras"]);
    expect(forTop.optional[0].mod).toBeUndefined();
    expect(forTop.conflicts.map((item) => item.mod?.title)).toEqual([
      "OldRenderer",
    ]);

    const forLib = modRelations([top, lib, fan, renderer, hater], lib, index);
    expect(titles(forLib.requiredBy)).toEqual(["Top"]);
    expect(forLib.embedded).toEqual(["mixinextras"]);
    expect(forLib.conflicts.map((item) => item.title)).toEqual(["Hater"]);
  });
});
