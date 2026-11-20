import os from "os";
import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() },
}));

vi.mock("../services/ModManager", () => ({
  ModManager: { identifyLocalFiles: vi.fn() },
}));

import { ProjectType, Provider } from "@/types/ModManager";
import { IMPORT_PARTS, type ImportPart } from "@/types/LauncherImport";
import { ModManager } from "../services/ModManager";
import { buildContentList, importedJvm, importedMemory, planImport } from "./plan";
import { scanMmcRoot } from "./formats/mmc";
import { tempDir, useFixture } from "./fixtures.testutil";

const cleanup: string[] = [];
const identify = vi.mocked(ModManager.identifyLocalFiles);

beforeEach(() => {
  identify.mockImplementation(async (requests) => ({
    unavailable: [],
    matches: requests
      .filter((request) => request.key === "mods/sodium-fabric-0.5.8.jar")
      .map((request) => ({
        key: request.key,
        provider: Provider.MODRINTH as const,
        loaders: ["fabric"],
        project: {
          id: "AANobbMI",
          title: "Sodium",
          description: "Rendering engine",
          iconUrl: "https://cdn.modrinth.com/sodium.png",
          url: "https://modrinth.com/mod/sodium",
          provider: Provider.MODRINTH,
          projectType: ProjectType.MOD,
        } as never,
        version: {
          id: "OihdIimA",
          name: "0.5.8",
          files: [
            {
              filename: "sodium-fabric-0.5.8+mc1.20.1.jar",
              size: 14,
              sha1: request.sha1,
              url: "https://cdn.modrinth.com/data/AANobbMI/sodium.jar",
              isServer: false,
              isClient: true,
            },
          ],
          dependencies: [],
        } as never,
      })),
  }));
});

afterEach(async () => {
  identify.mockReset();
  for (const dir of cleanup.splice(0)) await fs.remove(dir);
});

async function prismFabric() {
  const root = await useFixture("prism");
  cleanup.push(root);
  return (await scanMmcRoot(root, "prism")).find((item) => item.loader === "fabric")!;
}

function sha1(content: string) {
  return createHash("sha1").update(content).digest("hex");
}

describe("importedJvm and importedMemory", () => {
  it("keeps only safe JVM flags and drops memory flags", () => {
    expect(
      importedJvm(["-Xmx4G", "-Xms1G", "-XX:+UseG1GC", "-javaagent:evil.jar", "-Dfoo=a b", "-Djava.library.path=C:/x"]),
    ).toEqual({ jvmArguments: '-XX:+UseG1GC "-Dfoo=a b"', keepOptimizedJvm: false });
    expect(importedJvm(["-XX:MaxGCPauseMillis=50"])).toEqual({
      jvmArguments: "-XX:MaxGCPauseMillis=50",
      keepOptimizedJvm: true,
    });
    expect(importedJvm([])).toEqual({ jvmArguments: "", keepOptimizedJvm: true });
  });

  it("clamps memory to at least 1 GB and at most the machine's RAM", () => {
    expect(importedMemory(undefined)).toBeUndefined();
    expect(importedMemory(512)).toBe(1024);
    expect(importedMemory(4096)).toBe(4096);
    const total = Math.floor(os.totalmem() / (1024 * 1024));
    expect(importedMemory(total * 4)).toBe(total);
  });
});

describe("buildContentList", () => {
  it("links recognised mods to Modrinth and keeps the rest as local files", async () => {
    const instance = await prismFabric();
    const { mods, identified } = await buildContentList(
      instance,
      new Set<ImportPart>(["mods", "packs"]),
      "1.20.1",
    );

    expect(identified).toBe(1);
    expect(identify).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: "mods/sodium-fabric-0.5.8.jar", gameVersion: "1.20.1", sha1: sha1("fixture sodium") }),
      ]),
    );

    const sodium = mods.find((mod) => mod.id === "AANobbMI")!;
    expect(sodium).toMatchObject({ provider: Provider.MODRINTH, title: "Sodium", projectType: ProjectType.MOD });
    expect(sodium.version?.files[0]).toMatchObject({
      filename: "sodium-fabric-0.5.8.jar",
      sha1: sha1("fixture sodium"),
      url: "https://cdn.modrinth.com/data/AANobbMI/sodium.jar",
    });
    expect(sodium.version?.files[0].localPath).toBeUndefined();

    const old = mods.find((mod) => mod.version?.files[0].filename === "oldmod-1.0.jar")!;
    expect(old.provider).toBe(Provider.LOCAL);
    expect(old.version?.files[0]).toMatchObject({
      disabled: true,
      localPath: path.join(instance.gameDir, "mods", "oldmod-1.0.jar.disabled"),
    });

    const pack = mods.find((mod) => mod.projectType === ProjectType.RESOURCEPACK)!;
    expect(pack.version?.files[0].filename).toBe("Faithful.zip");
  });

  it("skips content parts that were not chosen", async () => {
    const instance = await prismFabric();
    expect((await buildContentList(instance, new Set<ImportPart>(["worlds"]), "1.20.1")).mods).toEqual([]);
    expect(identify).not.toHaveBeenCalled();
  });

  it("keeps every file local when the catalogs are unreachable", async () => {
    identify.mockRejectedValue(new Error("offline"));
    const instance = await prismFabric();
    const { mods, identified, checked } = await buildContentList(instance, new Set<ImportPart>(["mods"]), "1.20.1");
    expect(identified).toBe(0);
    expect(checked).toBe(false);
    expect(mods.every((mod) => mod.provider === Provider.LOCAL)).toBe(true);
    expect(mods).toHaveLength(2);
  });
});

describe("planImport", () => {
  it("describes the new instance without writing into the source", async () => {
    const instance = await prismFabric();
    const staging = await tempDir("staging");
    cleanup.push(staging);

    const plan = await planImport("0123456789abcdef0123", instance, new Set(IMPORT_PARTS), staging);

    expect(plan).toMatchObject({
      id: "0123456789abcdef0123",
      sourceRoot: instance.gameDir,
      memoryMb: 4096,
      jvmArguments: "-XX:+UseZGC -Dsodium.checks=false",
      keepOptimizedJvm: false,
      identified: 1,
      catalogChecked: true,
    });
    expect(plan.bytes).toBeGreaterThan(0);
    expect(plan.modpack).toMatchObject({
      name: "Мой Fabric",
      version: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.15.11",
      folderPath: staging,
    });
    expect(plan.modpack.image).toMatch(/^data:image\/png;base64,/);
    expect(await fs.pathExists(path.join(instance.instanceDir, "overrides"))).toBe(false);
  });

  it("leaves memory and JVM out when that part is off", async () => {
    const instance = await prismFabric();
    const staging = await tempDir("staging-off");
    cleanup.push(staging);

    const plan = await planImport("0123456789abcdef0123", instance, new Set<ImportPart>(["mods"]), staging);
    expect(plan).toMatchObject({ memoryMb: undefined, jvmArguments: "", keepOptimizedJvm: true });
  });
});
