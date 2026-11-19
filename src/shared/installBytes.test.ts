import { describe, expect, it } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import { contentBytes } from "./installBytes";

function mod(size: number, localPath?: string): ILocalProject {
  return {
    title: "m",
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    id: `m${size}`,
    version: {
      id: "1",
      dependencies: [],
      files: [{ filename: "m.jar", size, sha1: "", url: "", isServer: true, localPath }],
    },
  };
}

describe("contentBytes", () => {
  it("adds up downloads and counts extra files once per side", () => {
    expect(
      contentBytes(
        [mod(100), mod(50)],
        [
          { path: "config/a", url: "", sha1: "", size: 10, isClient: true, isServer: true },
          { path: "config/b", url: "", sha1: "", size: 5, isClient: true, isServer: false },
        ],
      ),
    ).toBe(175);
  });

  it("does not count files copied from the archive itself", () => {
    expect(contentBytes([mod(100, "C:/temp/pack/overrides/mods/m.jar"), mod(-1)])).toBe(0);
  });
});
