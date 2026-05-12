import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { importVersion, sanitizeImportedVersionConf } from "./versions";
import { ProjectType, Provider } from "@/types/ModManager";

const tempRoots: string[] = [];

async function makeTempRoot() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-test-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((tempRoot) => fs.remove(tempRoot)));
});

describe("import version helpers", () => {
  it("sanitizes imported version config without keeping owner/share/local paths", async () => {
    const tempRoot = await makeTempRoot();
    const versionPath = path.join(tempRoot, "Imported Pack");
    await fs.ensureDir(versionPath);
    await fs.writeFile(path.join(versionPath, "logo.png"), "logo");

    const conf = sanitizeImportedVersionConf(
      {
        name: "Imported Pack",
        owner: "discord_owner",
        shareCode: "share-code",
        downloadedVersion: true,
        image: "file:///C:/Old/logo.png",
        loader: {
          name: "fabric",
          mods: [
            {
              id: "local-mod",
              title: "Local Mod",
              description: "",
              projectType: ProjectType.MOD,
              iconUrl: null,
              url: "",
              provider: Provider.LOCAL,
              version: {
                id: "v1",
                dependencies: [],
                files: [
                  {
                    filename: "local.jar",
                    size: 1,
                    sha1: "sha1",
                    url: "file:///C:/Mods/local.jar",
                    localPath: "C:/Mods/local.jar",
                    isServer: false,
                  },
                ],
              },
            },
          ],
        },
      } as any,
      versionPath,
    );

    expect(conf.owner).toBeUndefined();
    expect(conf.shareCode).toBeUndefined();
    expect(conf.downloadedVersion).toBe(false);
    expect(conf.image).toContain("logo.png");
    expect(conf.loader.mods[0].version?.files[0].url).toBe("");
    expect(conf.loader.mods[0].version?.files[0].localPath).toBeUndefined();
  });

  it("removes the extracted version folder when import fails after extraction starts", async () => {
    const tempRoot = await makeTempRoot();
    const zipPath = path.join(tempRoot, "broken-pack.zip");
    const importTempPath = path.join(tempRoot, "import");
    const expectedVersionPath = path.join(importTempPath, "broken-pack");
    const archive = new AdmZip();
    archive.addFile("../evil.txt", Buffer.from("unsafe"));
    archive.writeZip(zipPath);

    await expect(importVersion(zipPath, importTempPath)).rejects.toThrow();
    await expect(fs.pathExists(expectedVersionPath)).resolves.toBe(false);
  });
});
