import { describe, expect, it } from "vitest";
import { ProjectType } from "@/types/ModManager";
import type { ILocalProject, ILocalVersion } from "@/types/ModManager";
import { ServerCore } from "@/types/Server";
import {
  contentPlan,
  contentStageOf,
  isModdedServerCore,
} from "./installPlan";

function project(
  projectType: ProjectType,
  files = 1,
): Pick<ILocalProject, "projectType" | "version"> {
  return {
    projectType,
    version: {
      id: "1",
      dependencies: [],
      files: new Array(files).fill({}),
    } as unknown as ILocalVersion,
  };
}

describe("contentPlan", () => {
  it("lists only the kinds of content the instance has, in install order", () => {
    expect(
      contentPlan([project(ProjectType.WORLD), project(ProjectType.MOD)]),
    ).toEqual(["mods", "worlds", "cleanup"]);
  });

  it("puts resource packs, shaders and data packs into one stage", () => {
    expect(
      contentPlan([
        project(ProjectType.SHADER),
        project(ProjectType.DATAPACK),
        project(ProjectType.RESOURCEPACK),
      ]),
    ).toEqual(["packs", "cleanup"]);
  });

  it("plans only the cleanup for an instance without content", () => {
    expect(contentPlan([])).toEqual(["cleanup"]);
  });

  it("skips projects that have nothing to download", () => {
    expect(
      contentPlan([
        project(ProjectType.MOD, 0),
        { projectType: ProjectType.WORLD, version: null },
      ]),
    ).toEqual(["cleanup"]);
  });

  it("counts plugins only when the instance has a server", () => {
    expect(contentPlan([project(ProjectType.PLUGIN)])).toEqual(["cleanup"]);
    expect(
      contentPlan([project(ProjectType.PLUGIN)], { core: ServerCore.PAPER }),
    ).toEqual(["mods", "cleanup"]);
  });

  it("adds the server mod sync for a modded server", () => {
    expect(
      contentPlan([project(ProjectType.MOD)], { core: ServerCore.FABRIC }),
    ).toEqual(["mods", "serverMods", "cleanup"]);
  });
});

describe("contentStageOf", () => {
  it("maps every project type to the stage that downloads it", () => {
    expect(contentStageOf(ProjectType.MOD)).toBe("mods");
    expect(contentStageOf(ProjectType.PLUGIN)).toBe("mods");
    expect(contentStageOf(ProjectType.RESOURCEPACK)).toBe("packs");
    expect(contentStageOf(ProjectType.SHADER)).toBe("packs");
    expect(contentStageOf(ProjectType.DATAPACK)).toBe("packs");
    expect(contentStageOf(ProjectType.WORLD)).toBe("worlds");
  });
});

describe("isModdedServerCore", () => {
  it("recognises only cores that load mods", () => {
    expect(isModdedServerCore(ServerCore.NEOFORGE)).toBe(true);
    expect(isModdedServerCore(ServerCore.QUILT)).toBe(true);
    expect(isModdedServerCore(ServerCore.PAPER)).toBe(false);
    expect(isModdedServerCore(ServerCore.VANILLA)).toBe(false);
    expect(isModdedServerCore(undefined)).toBe(false);
  });
});
