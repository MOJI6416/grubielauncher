import { describe, expect, it } from "vitest";
import type { ForeignInstanceSummary } from "@/types/LauncherImport";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import {
  defaultSelection,
  groupByLauncher,
  groupState,
  orderedParts,
  toggleGroup,
} from "./selection";
import { rebaseLocalPaths } from "./rebase";

function summary(id: string, launcher: ForeignInstanceSummary["launcher"]): ForeignInstanceSummary {
  return {
    id,
    launcher,
    name: id,
    minecraftVersion: "1.20.1",
    loader: "fabric",
    counts: { mods: 0, worlds: 0, screenshots: 0, packs: 0 },
    hasJvmArgs: false,
    sharedGameDir: false,
  };
}

const instances = [
  summary("tl-1", "tlauncher"),
  summary("prism-1", "prism"),
  summary("prism-2", "prism"),
  summary("cf-1", "curseforge"),
];

describe("launcher import selection", () => {
  it("groups instances in the launcher order", () => {
    expect(groupByLauncher(instances).map((group) => [group.launcher, group.instances.length])).toEqual([
      ["prism", 2],
      ["curseforge", 1],
      ["tlauncher", 1],
    ]);
  });

  it("selects everything that was not moved before", () => {
    expect([...defaultSelection(instances, new Set(["prism-2"]))].sort()).toEqual(["cf-1", "prism-1", "tl-1"]);
  });

  it("toggles a whole launcher and reports a mixed state", () => {
    const [prism] = groupByLauncher(instances);
    const none = toggleGroup(new Set(), prism, false);
    expect(groupState(none, prism)).toBe(false);
    expect(groupState(new Set(["prism-1"]), prism)).toBe("indeterminate");
    expect(groupState(toggleGroup(new Set(["cf-1"]), prism, true), prism)).toBe(true);
    expect([...toggleGroup(new Set(["cf-1", "prism-1"]), prism, false)]).toEqual(["cf-1"]);
  });

  it("keeps parts in a stable order", () => {
    expect(orderedParts(new Set(["memory", "mods", "worlds"]))).toEqual(["mods", "worlds", "memory"]);
  });
});

describe("rebaseLocalPaths", () => {
  function mod(localPath: string, url: string): ILocalProject {
    return {
      title: "x",
      description: "",
      projectType: ProjectType.MOD,
      iconUrl: null,
      url: "",
      provider: Provider.LOCAL,
      id: "x",
      version: {
        id: "local",
        dependencies: [],
        files: [{ filename: "x.jar", size: 1, sha1: "", url, localPath, isServer: true }],
      },
    };
  }

  it("moves local paths from the other launcher into the new instance", () => {
    const mods = [
      mod("C:\\Users\\steve\\curseforge\\minecraft\\Instances\\Pack\\mods\\x.jar", "file:///C:/Users/steve/curseforge/minecraft/Instances/Pack/mods/x.jar"),
      mod("D:\\elsewhere\\y.jar", "https://cdn.example/y.jar"),
    ];
    rebaseLocalPaths(mods, "C:\\Users\\steve\\curseforge\\minecraft\\Instances\\Pack\\", "D:\\Grubie\\minecraft\\versions\\Pack");

    expect(mods[0].version?.files[0]).toMatchObject({
      localPath: "D:/Grubie/minecraft/versions/Pack/mods/x.jar",
      url: "file:///D:/Grubie/minecraft/versions/Pack/mods/x.jar",
    });
    expect(mods[1].version?.files[0]).toMatchObject({
      localPath: "D:\\elsewhere\\y.jar",
      url: "https://cdn.example/y.jar",
    });
  });
});
