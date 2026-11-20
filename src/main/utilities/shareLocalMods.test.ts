import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ILocalFile,
  ILocalProject,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import type { Version } from "../game/Version";

const uploads = vi.hoisted(() => [] as string[][]);

vi.mock("../services/Backend", () => ({
  Backend: class {
    async uploadFileFromPathDirect(
      filePath: string,
      name: string,
      folder: string,
    ) {
      uploads.push([path.basename(filePath), name, folder]);
      return `https://cdn.grubielauncher.com/${folder}/${name}`;
    }
  },
}));

import { uploadMods } from "./share";

let root: string;

function localMod(filename: string, extra: Partial<ILocalFile> = {}): ILocalProject {
  return {
    title: filename,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.LOCAL,
    id: filename,
    version: {
      id: filename,
      dependencies: [],
      files: [
        {
          filename,
          size: 1,
          sha1: "sha",
          url: "",
          isServer: true,
          ...extra,
        },
      ],
    },
  };
}

function versionWith(mods: ILocalProject[]): Version {
  return {
    versionPath: root,
    version: { shareCode: "code", loader: { mods } },
  } as unknown as Version;
}

beforeEach(async () => {
  uploads.length = 0;
  root = await fs.mkdtemp(path.join(os.tmpdir(), "share-localmods-"));
});

afterEach(async () => {
  await fs.remove(root);
});

describe("uploadMods", () => {
  it("publishes a disabled local mod as disabled instead of failing", async () => {
    await fs.outputFile(path.join(root, "mods", "on.jar"), "on");
    await fs.outputFile(path.join(root, "mods", "off.jar.disabled"), "off");

    const result = await uploadMods(
      "token",
      versionWith([localMod("on.jar"), localMod("off.jar")]),
    );

    expect(result.success).toBe(true);
    expect(result.failures).toEqual([]);
    expect(uploads).toEqual([
      ["on.jar", "on.jar", "modpacks/code/mods"],
      ["off.jar.disabled", "off.jar", "modpacks/code/mods"],
    ]);
    const [on, off] = result.mods.map((mod) => mod.version!.files[0]);
    expect(on.disabled).toBeUndefined();
    expect(off.disabled).toBe(true);
    expect(off.url).toBe(
      "https://cdn.grubielauncher.com/modpacks/code/mods/off.jar",
    );
  });

  it("marks the mod disabled when the source copy lives outside the instance", async () => {
    const source = path.join(root, "outside", "lib.jar");
    await fs.outputFile(source, "lib");
    await fs.outputFile(path.join(root, "mods", "lib.jar.disabled"), "lib");

    const result = await uploadMods(
      "token",
      versionWith([localMod("lib.jar", { localPath: source })]),
    );

    expect(result.success).toBe(true);
    expect(uploads).toEqual([["lib.jar", "lib.jar", "modpacks/code/mods"]]);
    expect(result.mods[0].version!.files[0].disabled).toBe(true);
  });

  it("still reports a mod that is gone in both forms", async () => {
    const result = await uploadMods(
      "token",
      versionWith([localMod("gone.jar")]),
    );

    expect(result.success).toBe(false);
    expect(result.failures).toEqual(["gone.jar: file not found locally"]);
    expect(uploads).toEqual([]);
  });
});
