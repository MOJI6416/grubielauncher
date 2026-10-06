import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { uploadJarMods } from "./share";

let root: string;

beforeEach(async () => {
  uploads.length = 0;
  root = await fs.mkdtemp(path.join(os.tmpdir(), "share-jarmods-"));
  await fs.outputFile(path.join(root, "jarmods", "a.jar"), "jar-a");
  await fs.outputFile(path.join(root, "jarmods", "m.jar"), "jar-m");
});

afterEach(async () => {
  await fs.remove(root);
});

describe("uploadJarMods", () => {
  it("uploads jar mods into the build's folder with checksums", async () => {
    const result = await uploadJarMods("token", root, "code", {
      mods: [
        { file: "a.jar", name: "BTA", enabled: true },
        {
          file: "kept.jar",
          name: "Kept",
          enabled: false,
          url: "https://cdn.grubielauncher.com/modpacks/code/jarmods/kept.jar",
        },
      ],
      main: { file: "m.jar", name: "minecraft.jar", enabled: true },
    });

    expect(uploads).toEqual([
      ["a.jar", "a.jar", "modpacks/code/jarmods"],
      ["m.jar", "m.jar", "modpacks/code/jarmods"],
    ]);
    expect(result.mods[0]).toEqual({
      file: "a.jar",
      name: "BTA",
      enabled: true,
      url: "https://cdn.grubielauncher.com/modpacks/code/jarmods/a.jar",
      sha1: expect.stringMatching(/^[0-9a-f]{40}$/),
      size: 5,
    });
    expect(result.mods[1].url).toContain("/modpacks/code/jarmods/kept.jar");
    expect(result.main?.url).toContain("/modpacks/code/jarmods/m.jar");
  });

  it("re-uploads a copy that belongs to another build", async () => {
    await uploadJarMods("token", root, "code", {
      mods: [
        {
          file: "a.jar",
          name: "BTA",
          enabled: true,
          url: "https://cdn.grubielauncher.com/modpacks/other/jarmods/a.jar",
        },
      ],
      main: null,
    });

    expect(uploads).toEqual([["a.jar", "a.jar", "modpacks/code/jarmods"]]);
  });

  it("fails loudly when a jar mod file is gone", async () => {
    await expect(
      uploadJarMods("token", root, "code", {
        mods: [{ file: "gone.jar", name: "Gone", enabled: true }],
        main: null,
      }),
    ).rejects.toThrow("Gone: file not found locally");
  });
});
