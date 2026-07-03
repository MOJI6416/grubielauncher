import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HashAlgo } from "@/types/CurseForge";
import { ProjectType, Provider } from "@/types/ModManager";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.env.TEMP || "C:\\Temp"),
  },
}));

vi.mock("../services/CurseForge", () => ({
  CurseForge: {
    getMods: vi.fn(),
    getFiles: vi.fn(),
    getFile: vi.fn(),
  },
}));

vi.mock("../services/Modrinth", () => ({
  Modrinth: {
    getProjects: vi.fn(),
  },
}));

import { CurseForge } from "../services/CurseForge";
import { Modrinth } from "../services/Modrinth";
import {
  cfModpackToModpack,
  checkModpack,
  classIdToProjectType,
  compareMods,
} from "./modManager";

const mockedCurseForge = vi.mocked(CurseForge);
const mockedModrinth = vi.mocked(Modrinth);
const tempRoots: string[] = [];

async function makeTempRoot() {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "grubie-modpack-test-"),
  );
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((tempRoot) => fs.remove(tempRoot)));
});

function createManifest(overrides: Record<string, unknown> = {}) {
  return {
    minecraft: {
      version: "1.20.1",
      modLoaders: [{ id: "forge-47.2.20", primary: true }],
    },
    manifestType: "minecraftModpack",
    manifestVersion: 1,
    name: "CurseForge pack",
    version: "1.0.0",
    author: "Tester",
    files: [{ projectID: 100, fileID: 200, required: true }],
    ...overrides,
  } as any;
}

function createMod(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    name: "Required mod",
    summary: "Required mod summary",
    classId: 6,
    links: { websiteUrl: "https://www.curseforge.com/minecraft/mc-mods/required-mod" },
    logo: { url: "https://cdn.example/icon.png" },
    screenshots: [],
    latestFilesIndexes: [
      {
        gameVersion: "1.20.1",
        fileId: 999,
        filename: "latest-compatible.jar",
        modLoader: 1,
      },
    ],
    ...overrides,
  } as any;
}

function createFile(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    fileName: `file-${id}.jar`,
    fileLength: 1234,
    downloadUrl: `https://cdn.example/file-${id}.jar`,
    hashes: [{ algo: HashAlgo.Sha1, value: `sha1-${id}` }],
    isServerPack: false,
    ...overrides,
  } as any;
}

describe("cfModpackToModpack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCurseForge.getMods.mockResolvedValue([createMod()]);
    mockedCurseForge.getFiles.mockResolvedValue([createFile(200)]);
    mockedCurseForge.getFile.mockResolvedValue(null as any);
  });

  it("keeps CurseForge loader version from the manifest", async () => {
    const result = await cfModpackToModpack(createManifest());

    expect(result.loader).toBe("forge");
    expect(result.loaderVersion).toBe("47.2.20");
  });

  it("uses exact manifest fileID from bulk CurseForge response", async () => {
    mockedCurseForge.getFiles.mockResolvedValue([
      createFile(999, { fileName: "latest-compatible.jar" }),
      createFile(200, { fileName: "manifest-file.jar" }),
    ]);

    const result = await cfModpackToModpack(createManifest());

    expect(result.mods).toHaveLength(1);
    expect(result.mods[0]).toMatchObject({
      provider: Provider.CURSEFORGE,
      projectType: ProjectType.MOD,
      version: {
        id: "200",
        files: [
          expect.objectContaining({
            filename: "manifest-file.jar",
            url: "https://cdn.example/file-200.jar",
            sha1: "sha1-200",
          }),
        ],
      },
    });
  });

  it("fetches exact manifest fileID when the bulk response does not include it", async () => {
    mockedCurseForge.getFiles.mockResolvedValue([]);
    mockedCurseForge.getFile.mockResolvedValue(createFile(200, { fileName: "fetched-exact.jar" }));

    const result = await cfModpackToModpack(createManifest());

    expect(mockedCurseForge.getFile).toHaveBeenCalledWith(100, 200);
    expect(result.mods[0].version?.id).toBe("200");
    expect(result.mods[0].version?.files[0].filename).toBe("fetched-exact.jar");
  });

  it("does not fallback to latest compatible file when exact fileID is unavailable", async () => {
    mockedCurseForge.getFiles.mockResolvedValue([]);
    mockedCurseForge.getFile.mockResolvedValue(null as any);

    await expect(cfModpackToModpack(createManifest())).rejects.toThrow(
      "CurseForge file 200 for project 100 was not found.",
    );
  });

  it("skips optional CurseForge files from the manifest", async () => {
    mockedCurseForge.getMods.mockResolvedValue([
      createMod({ id: 100, name: "Optional mod" }),
      createMod({ id: 101, name: "Required mod" }),
    ]);
    mockedCurseForge.getFiles.mockResolvedValue([
      createFile(200, { fileName: "optional.jar" }),
      createFile(201, { fileName: "required.jar" }),
    ]);

    const result = await cfModpackToModpack(
      createManifest({
        files: [
          { projectID: 100, fileID: 200, required: false },
          { projectID: 101, fileID: 201, required: true },
        ],
      }),
    );

    expect(mockedCurseForge.getMods).toHaveBeenCalledWith([100, 101]);
    expect(result.mods).toHaveLength(1);
    expect(result.mods[0].id).toBe("101");
    expect(result.mods[0].version?.id).toBe("201");
  });
});

describe("compareMods", () => {
  it("ignores plugins because plugins are not published with modpacks", () => {
    const sharedMod = {
      id: "mod-a",
      title: "Mod A",
      provider: Provider.MODRINTH,
      projectType: ProjectType.MOD,
      version: {
        id: "version-a",
        dependencies: [],
        files: [{ filename: "mod-a.jar", sha1: "sha1-a", size: 100 }],
      },
    } as any;
    const localPlugin = {
      id: "plugin-a",
      title: "Plugin A",
      provider: Provider.LOCAL,
      projectType: ProjectType.PLUGIN,
      version: {
        id: "local",
        dependencies: [],
        files: [{ filename: "plugin-a.jar", sha1: "sha1-plugin", size: 10 }],
      },
    } as any;

    expect(compareMods([sharedMod, localPlugin], [sharedMod])).toBe(true);
  });
});

describe("checkModpack Prism/MultiMC imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCurseForge.getMods.mockResolvedValue([]);
    mockedCurseForge.getFiles.mockResolvedValue([]);
    mockedCurseForge.getFile.mockResolvedValue(null as any);
    mockedModrinth.getProjects.mockResolvedValue([]);
  });

  async function createPrismInstance(instanceRoot: string, name = "Prism Pack") {
    await fs.outputJSON(path.join(instanceRoot, "mmc-pack.json"), {
      components: [
        { uid: "net.minecraft", version: "1.20.1" },
        { uid: "net.minecraftforge", version: "47.2.20" },
      ],
    });
    await fs.writeFile(path.join(instanceRoot, "instance.cfg"), `name=${name}\n`);
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", "example.jar"),
      "local mod",
    );
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "config", "example.toml"),
      "enabled=true",
    );
  }

  it("imports Prism/MultiMC metadata and local files", async () => {
    const instanceRoot = await makeTempRoot();
    await createPrismInstance(instanceRoot);

    const result = await checkModpack(instanceRoot);

    expect(result).toMatchObject({
      name: "Prism Pack",
      version: "1.20.1",
      loader: "forge",
      loaderVersion: "47.2.20",
      folderPath: instanceRoot,
    });
    expect(result?.mods).toHaveLength(1);
    expect(result?.mods[0]).toMatchObject({
      provider: Provider.LOCAL,
      projectType: ProjectType.MOD,
      title: "example.jar",
      version: {
        id: "local",
        files: [
          expect.objectContaining({
            filename: "example.jar",
            localPath: path.join(instanceRoot, "overrides", "mods", "example.jar"),
          }),
        ],
      },
    });
    await expect(
      fs.pathExists(path.join(instanceRoot, "overrides", "config", "example.toml")),
    ).resolves.toBe(true);
  });

  it("finds Prism/MultiMC exports inside one top-level folder", async () => {
    const tempRoot = await makeTempRoot();
    const nestedRoot = path.join(tempRoot, "Exported Instance");
    await createPrismInstance(nestedRoot, "Nested Prism Pack");

    const result = await checkModpack(tempRoot);

    expect(result?.name).toBe("Nested Prism Pack");
    expect(result?.folderPath).toBe(nestedRoot);
    expect(result?.mods[0].version?.files[0].localPath).toBe(
      path.join(nestedRoot, "overrides", "mods", "example.jar"),
    );
  });

  it("keeps Prism context when a Modrinth manifest is nested in the export", async () => {
    const instanceRoot = await makeTempRoot();
    await createPrismInstance(instanceRoot, "Fabulously Optimized");
    await fs.outputFile(path.join(instanceRoot, ".minecraft", "icon.png"), "icon");
    await fs.outputJSON(path.join(instanceRoot, "mrpack", "modrinth.index.json"), {
      formatVersion: 1,
      game: "minecraft",
      versionId: "13.2.0",
      name: "Internal Modrinth Name",
      files: [
        {
          path: "mods/example.jar",
          hashes: { sha1: "sha1-example" },
          env: { client: "required", server: "required" },
          downloads: [
            "https://cdn.modrinth.com/data/project123/versions/version456/example.jar",
          ],
          fileSize: 123,
        },
      ],
      dependencies: {
        minecraft: "1.20.1",
        "fabric-loader": "0.15.11",
      },
    });

    const result = await checkModpack(instanceRoot);

    expect(result).toMatchObject({
      name: "Fabulously Optimized",
      version: "1.20.1",
      loader: "forge",
      loaderVersion: "47.2.20",
      folderPath: instanceRoot,
    });
    expect(result?.image).toContain("minecraft/icon.png");
    expect(result?.mods).toHaveLength(1);
    expect(result?.mods[0]).toMatchObject({
      provider: Provider.MODRINTH,
      projectType: ProjectType.MOD,
      id: "project123",
      version: {
        id: "version456",
        files: [
          expect.objectContaining({
            filename: "example.jar",
            url: "https://cdn.modrinth.com/data/project123/versions/version456/example.jar",
            sha1: "sha1-example",
          }),
        ],
      },
    });
    expect(result?.mods[0].version?.files[0].localPath).toBeUndefined();
    await expect(
      fs.pathExists(path.join(instanceRoot, "overrides", "mods", "example.jar")),
    ).resolves.toBe(true);
  });

  it("uses Prism .index metadata to keep Modrinth provider links", async () => {
    const instanceRoot = await makeTempRoot();
    await createPrismInstance(instanceRoot, "Indexed Modrinth Pack");
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", "indexed.jar"),
      "indexed mod",
    );
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", ".index", "indexed.pw.toml"),
      [
        "filename = 'indexed.jar'",
        "name = 'Indexed Mod'",
        "side = 'client'",
        "x-prismlauncher-version-number = '1.0.0'",
        "",
        "[download]",
        "hash = 'sha1-indexed'",
        "hash-format = 'sha1'",
        "mode = 'url'",
        "url = 'https://cdn.modrinth.com/data/project123/versions/version456/indexed.jar'",
        "",
        "[update.modrinth]",
        "mod-id = 'project123'",
        "version = 'version456'",
      ].join("\n"),
    );

    const result = await checkModpack(instanceRoot);

    const indexedMod = result?.mods.find((mod) => mod.id === "project123");

    expect(result?.mods).toHaveLength(2);
    expect(indexedMod).toMatchObject({
      provider: Provider.MODRINTH,
      id: "project123",
      title: "Indexed Mod",
      version: {
        id: "version456",
        files: [
          expect.objectContaining({
            filename: "indexed.jar",
            url: "https://cdn.modrinth.com/data/project123/versions/version456/indexed.jar",
            localPath: path.join(instanceRoot, "overrides", "mods", "indexed.jar"),
            sha1: "sha1-indexed",
            isServer: false,
          }),
        ],
      },
    });
  });

  it("enriches Prism Modrinth .index mods with project metadata", async () => {
    const instanceRoot = await makeTempRoot();
    await createPrismInstance(instanceRoot, "Enriched Modrinth Pack");
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", "indexed.jar"),
      "indexed mod",
    );
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", ".index", "indexed.pw.toml"),
      [
        "filename = 'indexed.jar'",
        "name = 'Indexed Mod'",
        "side = 'client'",
        "",
        "[download]",
        "hash = 'sha1-indexed'",
        "hash-format = 'sha1'",
        "mode = 'url'",
        "url = 'https://cdn.modrinth.com/data/project123/versions/version456/indexed.jar'",
        "",
        "[update.modrinth]",
        "mod-id = 'project123'",
        "version = 'version456'",
      ].join("\n"),
    );
    mockedModrinth.getProjects.mockResolvedValue([
      {
        id: "project123",
        slug: "enriched-mod",
        title: "Enriched Mod",
        description: "Enriched summary",
        icon_url: "https://cdn.modrinth.com/icon.png",
        project_type: "mod",
        body: "Full body",
        gallery: [],
      } as any,
    ]);

    const result = await checkModpack(instanceRoot);
    const indexedMod = result?.mods.find((mod) => mod.id === "project123");

    expect(mockedModrinth.getProjects).toHaveBeenCalledWith(["project123"]);
    expect(indexedMod).toMatchObject({
      title: "Enriched Mod",
      description: "Enriched summary",
      iconUrl: "https://cdn.modrinth.com/icon.png",
      url: "https://modrinth.com/mod/enriched-mod",
      projectType: ProjectType.MOD,
      provider: Provider.MODRINTH,
    });
    expect(indexedMod?.version?.files[0]).toMatchObject({
      filename: "indexed.jar",
      localPath: path.join(instanceRoot, "overrides", "mods", "indexed.jar"),
    });
  });

  it("uses Prism .index metadata to keep CurseForge provider links", async () => {
    const instanceRoot = await makeTempRoot();
    await createPrismInstance(instanceRoot, "Indexed CurseForge Pack");
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", "curse.jar"),
      "curse mod",
    );
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", ".index", "curse.pw.toml"),
      [
        "filename = 'curse.jar'",
        "name = 'Curse Mod'",
        "side = 'server'",
        "x-prismlauncher-version-number = '2.0.0'",
        "",
        "[download]",
        "hash = 'sha1-curse'",
        "hash-format = 'sha1'",
        "mode = 'metadata:curseforge'",
        "url = ''",
        "",
        "[update.curseforge]",
        "project-id = 100",
        "file-id = 200",
      ].join("\n"),
    );

    const result = await checkModpack(instanceRoot);

    const indexedMod = result?.mods.find((mod) => mod.id === "100");

    expect(result?.mods).toHaveLength(2);
    expect(indexedMod).toMatchObject({
      provider: Provider.CURSEFORGE,
      id: "100",
      title: "Curse Mod",
      version: {
        id: "200",
        files: [
          expect.objectContaining({
            filename: "curse.jar",
            localPath: path.join(instanceRoot, "overrides", "mods", "curse.jar"),
            sha1: "sha1-curse",
            isServer: true,
          }),
        ],
      },
    });
  });

  it("enriches Prism CurseForge .index mods with project metadata", async () => {
    const instanceRoot = await makeTempRoot();
    await createPrismInstance(instanceRoot, "Enriched CurseForge Pack");
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", "curse.jar"),
      "curse mod",
    );
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", ".index", "curse.pw.toml"),
      [
        "filename = 'curse.jar'",
        "name = 'Curse Mod'",
        "side = 'server'",
        "",
        "[download]",
        "hash = 'sha1-curse'",
        "hash-format = 'sha1'",
        "mode = 'metadata:curseforge'",
        "url = ''",
        "",
        "[update.curseforge]",
        "project-id = 100",
        "file-id = 200",
      ].join("\n"),
    );
    mockedCurseForge.getMods.mockResolvedValue([
      createMod({
        name: "Enriched Curse Mod",
        summary: "Curse summary",
        logo: { url: "https://cdn.curseforge.com/icon.png" },
        links: {
          websiteUrl:
            "https://www.curseforge.com/minecraft/mc-mods/enriched-curse-mod",
        },
      }),
    ]);

    const result = await checkModpack(instanceRoot);
    const indexedMod = result?.mods.find((mod) => mod.id === "100");

    expect(mockedCurseForge.getMods).toHaveBeenCalledWith([100]);
    expect(indexedMod).toMatchObject({
      title: "Enriched Curse Mod",
      description: "Curse summary",
      iconUrl: "https://cdn.curseforge.com/icon.png",
      url: "https://www.curseforge.com/minecraft/mc-mods/enriched-curse-mod",
      projectType: ProjectType.MOD,
      provider: Provider.CURSEFORGE,
    });
    expect(indexedMod?.version?.files[0]).toMatchObject({
      filename: "curse.jar",
      localPath: path.join(instanceRoot, "overrides", "mods", "curse.jar"),
    });
  });

  it("keeps Prism instance name and icon when a CurseForge manifest is nested", async () => {
    const instanceRoot = await makeTempRoot();
    await createPrismInstance(instanceRoot, "SRP: Quarantine Zone");
    await fs.outputFile(path.join(instanceRoot, "curseforge_icon.png"), "icon");
    await fs.writeFile(
      path.join(instanceRoot, "instance.cfg"),
      "name=SRP: Quarantine Zone\niconKey=curseforge_icon\n",
    );
    await fs.outputJSON(
      path.join(instanceRoot, "flame", "manifest.json"),
      createManifest({
        name: "SRPQZ",
        files: [{ projectID: 100, fileID: 200, required: true }],
      }),
    );
    await fs.outputFile(
      path.join(instanceRoot, ".minecraft", "mods", "file-200.jar"),
      "remote mod already exported",
    );
    mockedCurseForge.getMods.mockResolvedValue([createMod()]);
    mockedCurseForge.getFiles.mockResolvedValue([createFile(200)]);
    mockedCurseForge.getFile.mockResolvedValue(null as any);

    const result = await checkModpack(instanceRoot);

    expect(result?.name).toBe("SRP: Quarantine Zone");
    expect(result?.image).toContain("curseforge_icon.png");
    expect(result?.mods).toHaveLength(2);
    expect(result?.mods[0]).toMatchObject({
      provider: Provider.CURSEFORGE,
      version: {
        id: "200",
        files: [expect.objectContaining({ filename: "file-200.jar" })],
      },
    });
    expect(
      result?.mods.filter(
        (mod) => mod.version?.files[0]?.filename === "file-200.jar",
      ),
    ).toHaveLength(1);
    await expect(
      fs.pathExists(path.join(instanceRoot, "overrides", "mods", "file-200.jar")),
    ).resolves.toBe(true);
  });
});

describe("classIdToProjectType", () => {
  it("maps known CurseForge class ids to project types", () => {
    expect(classIdToProjectType(6)).toBe(ProjectType.MOD);
    expect(classIdToProjectType(12)).toBe(ProjectType.RESOURCEPACK);
    expect(classIdToProjectType(6552)).toBe(ProjectType.SHADER);
    expect(classIdToProjectType(4471)).toBe(ProjectType.MODPACK);
    expect(classIdToProjectType(5)).toBe(ProjectType.PLUGIN);
    expect(classIdToProjectType(17)).toBe(ProjectType.WORLD);
    expect(classIdToProjectType(6945)).toBe(ProjectType.DATAPACK);
  });

  it("returns null for unknown or missing class ids", () => {
    expect(classIdToProjectType(4546)).toBeNull();
    expect(classIdToProjectType(undefined)).toBeNull();
    expect(classIdToProjectType(null)).toBeNull();
  });
});
