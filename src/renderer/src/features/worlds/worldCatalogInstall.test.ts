import { afterEach, describe, expect, it, vi } from "vitest";
import type { IVersion } from "@/types/ModManager";

function version(id: string, files: string[], releaseType: IVersion["releaseType"] = "release"): IVersion {
  return {
    id,
    name: id,
    dependencies: [],
    downloads: 0,
    releaseType,
    files: files.map((filename) => ({
      filename,
      size: 1,
      sha1: "",
      url: `https://cdn.example/${filename}`,
      isServer: true,
    })),
  };
}

async function load(versions: IVersion[]) {
  vi.resetModules();
  vi.stubGlobal("window", {
    api: {
      modManager: { getVersions: vi.fn(async () => versions) },
    },
  });
  return import("./worldCatalogInstall");
}

const instance = {
  version: {
    version: { id: "1.21.1", type: "release" },
    loader: { name: "fabric" },
  },
} as never;

const settings = { modUpdateChannel: "release" } as never;

const project = {
  id: "veinminer",
  provider: "modrinth",
  projectType: "datapack",
  url: "",
} as never;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalog versions for worlds and datapacks", () => {
  it("skips mod builds that ship only a jar", async () => {
    const module = await load([
      version("neoforge", ["veinminer-neoforge-2.14.0.jar"]),
      version("datapack", ["veinminer-datapack-2.14.0.zip"]),
    ]);

    const picked = await module.pickCatalogVersion(instance, project, settings);
    expect(picked?.id).toBe("datapack");
    expect(module.pickArchiveFile(picked!)?.filename).toBe(
      "veinminer-datapack-2.14.0.zip",
    );
  });

  it("has nothing to install when no version carries an archive", async () => {
    const module = await load([version("fabric", ["mod.jar"])]);

    expect(
      await module.pickCatalogVersion(instance, project, settings),
    ).toBeNull();
  });

  it("follows the update channel among archives", async () => {
    const module = await load([
      version("beta", ["map-2.zip"], "beta"),
      version("release", ["map-1.zip"]),
    ]);

    expect(
      (await module.pickCatalogVersion(instance, project, settings))?.id,
    ).toBe("release");
  });

  it("keeps file names inside the target folder", async () => {
    const module = await load([]);

    expect(module.safeFileName("pack.zip")).toBe("pack.zip");
    expect(module.safeFileName("../../evil.zip")).toBe("evil.zip");
    expect(module.safeFileName("..")).toBeNull();
    expect(module.safeFileName("a:b.zip")).toBeNull();
  });
});
