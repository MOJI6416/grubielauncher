import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importVersion, sanitizeImportedVersionConf } from "./versions";
import { INSTANCE_ID_FILE } from "@/shared/instancePrivacy";
import { ProjectType, Provider } from "@/types/ModManager";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.env.TEMP || "C:\\Temp"),
  },
}));

const identifyModpack = vi.fn();

vi.mock("../services/ModManager", () => ({
  ModManager: {
    search: vi.fn(async () => ({ projects: [] })),
    identifyModpack: (...args: unknown[]) => identifyModpack(...args),
  },
}));

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

  it("keeps imported local logo with non-png extension", async () => {
    const tempRoot = await makeTempRoot();
    const versionPath = path.join(tempRoot, "Imported Webp Pack");
    await fs.ensureDir(versionPath);
    await fs.writeFile(path.join(versionPath, "logo.webp"), "webp");

    const conf = sanitizeImportedVersionConf(
      {
        name: "Imported Webp Pack",
        image: "file:///C:/Old/logo.webp",
        downloadedVersion: true,
        loader: {
          name: "vanilla",
          mods: [],
        },
      } as any,
      versionPath,
    );

    expect(conf.image).toContain("logo.webp");
  });

  it("drops the instance id that travelled inside the archive", async () => {
    const tempRoot = await makeTempRoot();
    const versionPath = path.join(tempRoot, "Imported Stamped Pack");
    await fs.ensureDir(versionPath);

    const idPath = path.join(versionPath, INSTANCE_ID_FILE);
    await fs.writeFile(idPath, "11111111-2222-4333-8444-555555555555", "utf-8");

    sanitizeImportedVersionConf(
      {
        name: "Imported Stamped Pack",
        image: "",
        downloadedVersion: true,
        loader: { name: "vanilla", mods: [] },
      } as any,
      versionPath,
    );

    expect(await fs.pathExists(idPath)).toBe(false);
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

  it("imports Prism/MultiMC zip exports as modpacks", async () => {
    const tempRoot = await makeTempRoot();
    const zipPath = path.join(tempRoot, "prism-pack.zip");
    const importTempPath = path.join(tempRoot, "import");
    const archive = new AdmZip();

    archive.addFile(
      "mmc-pack.json",
      Buffer.from(
        JSON.stringify({
          components: [
            { uid: "net.minecraft", version: "1.20.1" },
            { uid: "net.fabricmc.fabric-loader", version: "0.15.11" },
          ],
        }),
      ),
    );
    archive.addFile("instance.cfg", Buffer.from("name=Prism Zip Pack\n"));
    archive.addFile(".minecraft/mods/example.jar", Buffer.from("local mod"));
    archive.writeZip(zipPath);

    const result = await importVersion(zipPath, importTempPath);

    expect(result.type).toBe("other");
    expect(result.other).toMatchObject({
      name: "Prism Zip Pack",
      version: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.15.11",
    });
    expect(result.other?.mods[0]).toMatchObject({
      provider: Provider.LOCAL,
      projectType: ProjectType.MOD,
      title: "example.jar",
    });
  });

  it("links an imported Modrinth pack to its project by the file hash", async () => {
    const tempRoot = await makeTempRoot();
    const zipPath = path.join(tempRoot, "fresh.mrpack");
    const importTempPath = path.join(tempRoot, "import");
    const archive = new AdmZip();

    archive.addFile(
      "modrinth.index.json",
      Buffer.from(
        JSON.stringify({
          game: "minecraft",
          formatVersion: 1,
          versionId: "2.6.5",
          name: "Fresh",
          files: [],
          dependencies: { minecraft: "1.21.1", "fabric-loader": "0.16.0" },
        }),
      ),
    );
    archive.writeZip(zipPath);

    const source = {
      provider: Provider.MODRINTH,
      projectId: "abc",
      versionId: "ver",
      versionNumber: "2.6.5",
      title: "Fresh",
      url: "https://modrinth.com/modpack/fresh",
    };
    identifyModpack.mockResolvedValueOnce(source);

    const result = await importVersion(zipPath, importTempPath);

    expect(identifyModpack).toHaveBeenCalledWith(zipPath);
    expect(result.other?.source).toEqual(source);
  });

  it("imports a pack without a link when the file is unknown", async () => {
    const tempRoot = await makeTempRoot();
    const zipPath = path.join(tempRoot, "custom.mrpack");
    const importTempPath = path.join(tempRoot, "import");
    const archive = new AdmZip();

    archive.addFile(
      "modrinth.index.json",
      Buffer.from(
        JSON.stringify({
          game: "minecraft",
          formatVersion: 1,
          versionId: "1",
          name: "Custom",
          files: [],
          dependencies: { minecraft: "1.21.1" },
        }),
      ),
    );
    archive.writeZip(zipPath);
    identifyModpack.mockRejectedValueOnce(new Error("offline"));

    const result = await importVersion(zipPath, importTempPath);

    expect(result.type).toBe("other");
    expect(result.other?.source).toBeUndefined();
  });
});
