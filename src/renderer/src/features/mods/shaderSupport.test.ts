import { describe, expect, it } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import { shaderSupport } from "./shaderSupport";

function mod(id: string, title: string, filename = `${id}.jar`, disabled = false): ILocalProject {
  return {
    title,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    id,
    version: {
      id: "v",
      files: [{ filename, size: 1, sha1: "", url: "", isServer: false, disabled }],
      dependencies: [],
    },
  };
}

describe("shaderSupport", () => {
  it("is ready when Iris, Oculus or OptiFine is in the instance", () => {
    expect(shaderSupport({ loader: "fabric", mods: [mod("YL57xq9U", "Iris Shaders")] }).state).toBe("ready");
    expect(shaderSupport({ loader: "forge", mods: [mod("x", "Oculus", "oculus-mc1.20.1-1.7.0.jar")] }).state).toBe("ready");
    expect(
      shaderSupport({
        loader: "forge",
        mods: [{ ...mod("local", "Local file", "OptiFine_1.20.1_HD_U_I6.jar"), provider: Provider.LOCAL }],
      }).state,
    ).toBe("ready");
    expect(
      shaderSupport({
        loader: "vanilla",
        mods: [],
        jarMods: [{ file: "OptiFine_1.8.9_HD_U_M5.zip", name: "OptiFine", enabled: true }],
      }).state,
    ).toBe("ready");
  });

  it("suggests Iris on Fabric, Quilt and NeoForge, and Oculus on Forge", () => {
    expect(shaderSupport({ loader: "fabric", mods: [mod("AANobbMI", "Sodium")] })).toEqual({
      state: "missing",
      slug: "iris",
      title: "Iris",
    });
    expect(shaderSupport({ loader: "neoforge", mods: [] })).toMatchObject({ slug: "iris" });
    expect(shaderSupport({ loader: "forge", mods: [] })).toMatchObject({ slug: "oculus" });
  });

  it("does not count a disabled shader loader", () => {
    expect(shaderSupport({ loader: "fabric", mods: [mod("YL57xq9U", "Iris Shaders", "iris.jar", true)] }).state).toBe(
      "missing",
    );
    expect(
      shaderSupport({
        loader: "fabric",
        mods: [mod("YL57xq9U", "Iris Shaders")],
        disabled: new Set(["modrinth:YL57xq9U"]),
      }).state,
    ).toBe("missing");
  });

  it("does not mistake a mod whose name only contains the letters for a loader", () => {
    expect(shaderSupport({ loader: "fabric", mods: [mod("x", "Irisflowers", "irisflowers-1.0.jar")] }).state).toBe("missing");
  });

  it("has no one-click answer for loaders without a shader mod", () => {
    expect(shaderSupport({ loader: "vanilla", mods: [] }).state).toBe("unsupported");
    expect(shaderSupport({ loader: "babric", mods: [] }).state).toBe("unsupported");
  });
});
