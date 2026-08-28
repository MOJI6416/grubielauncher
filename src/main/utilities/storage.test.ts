import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const electronState = vi.hoisted(() => ({
  appData: "C:\\Temp",
  trashed: [] as string[],
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => electronState.appData) },
  session: {
    defaultSession: { clearCache: vi.fn(), clearStorageData: vi.fn() },
  },
  shell: {
    trashItem: vi.fn(async (target: string) => {
      electronState.trashed.push(target);
      await fs.remove(target);
    }),
  },
}));

import {
  cleanupStorage,
  computeCleanup,
  majorFromJavaDir,
  mavenToRelPath,
} from "./storage";

describe("mavenToRelPath", () => {
  it("resolves basic coordinates", () => {
    expect(mavenToRelPath("com.mojang:logging:1.1.1")).toBe(
      "com/mojang/logging/1.1.1/logging-1.1.1.jar",
    );
  });

  it("resolves a native classifier", () => {
    expect(mavenToRelPath("org.lwjgl:lwjgl:3.3.1:natives-windows")).toBe(
      "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-windows.jar",
    );
  });

  it("honors a custom extension", () => {
    expect(mavenToRelPath("de.oceanlabs.mcp:mcp_config:1.20.1@zip")).toBe(
      "de/oceanlabs/mcp/mcp_config/1.20.1/mcp_config-1.20.1.zip",
    );
  });

  it("returns null for malformed names", () => {
    expect(mavenToRelPath("foo:bar")).toBeNull();
  });
});

describe("majorFromJavaDir", () => {
  it("parses modern Adoptium names", () => {
    expect(majorFromJavaDir("jdk-17.0.8+7")).toBe(17);
    expect(majorFromJavaDir("jdk-21.0.1+12")).toBe(21);
  });

  it("parses Java 8 names", () => {
    expect(majorFromJavaDir("jdk8u392-b08")).toBe(8);
  });

  it("returns null for unknown layouts", () => {
    expect(majorFromJavaDir("some-random-dir")).toBeNull();
  });
});

describe("computeCleanup", () => {
  it("does not offer a Java runtime for deletion when a manifest is unreadable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "storage-cleanup-"));
    const versionsPath = path.join(root, "versions");
    const librariesPath = path.join(root, "libraries");
    const javaDir = path.join(root, "java");

    await fs.ensureDir(path.join(versionsPath, "Pack"));
    await fs.ensureDir(librariesPath);
    await fs.ensureDir(path.join(javaDir, "jdk-21.0.1+12"));

    await fs.writeJSON(path.join(versionsPath, "Pack", "vanilla.json"), {
      libraries: [],
    });
    await fs.writeFile(
      path.join(versionsPath, "Pack", "Pack.json"),
      '{"javaVersion": {"majorVersion": 21',
    );

    const damaged = await computeCleanup(versionsPath, librariesPath, javaDir);
    expect(damaged.java.count).toBe(0);

    await fs.writeJSON(path.join(versionsPath, "Pack", "Pack.json"), {
      javaVersion: { majorVersion: 17 },
    });

    const healthy = await computeCleanup(versionsPath, librariesPath, javaDir);
    expect(healthy.java.count).toBe(1);

    await fs.remove(root);
  });
});

describe("cleanupStorage of world backups", () => {
  const ALIVE = "11111111-1111-4111-8111-111111111111";
  const STRANDED = "22222222-2222-4222-8222-222222222222";

  function record(id: string, versionName: string) {
    return {
      id,
      worldName: "World",
      worldFolder: "World",
      versionName,
      createdAt: 1,
      size: 4,
      trigger: "manual",
    };
  }

  async function prepare(index: string | null): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "storage-backups-"));
    electronState.appData = root;
    electronState.trashed = [];

    const launcher = path.join(root, ".grubielauncher");
    await fs.ensureDir(path.join(launcher, "minecraft", "versions", "Pack"));
    await fs.ensureDir(path.join(launcher, "backups"));

    for (const id of [ALIVE, STRANDED]) {
      await fs.writeFile(path.join(launcher, "backups", `${id}.zip`), "zip!");
    }

    if (index !== null) {
      await fs.writeFile(path.join(launcher, "backups", "index.json"), index);
    }

    return launcher;
  }

  afterEach(async () => {
    const root = electronState.appData;
    electronState.appData = "C:\\Temp";
    if (root !== "C:\\Temp") await fs.remove(root);
  });

  it("refuses to clean and keeps every archive when a record is damaged", async () => {
    const launcher = await prepare(
      JSON.stringify([
        record(ALIVE, "Pack"),
        { ...record(STRANDED, "Pack"), versionName: 42 },
      ]),
    );

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cleanup = await computeCleanup(
      path.join(launcher, "minecraft", "versions"),
      path.join(launcher, "minecraft", "libraries"),
      path.join(launcher, "java"),
    );
    spy.mockRestore();

    expect(cleanup.backups).toEqual({ count: 0, size: 0 });
    await expect(cleanupStorage("backups")).rejects.toThrow(
      /world backup index/i,
    );

    const left = await fs.readdir(path.join(launcher, "backups"));
    expect(left).toContain(`${ALIVE}.zip`);
    expect(left).toContain(`${STRANDED}.zip`);
  });

  it("refuses to clean when the index file is truncated", async () => {
    const launcher = await prepare('[{"id":"111111');

    await expect(cleanupStorage("backups")).rejects.toThrow(
      /world backup index/i,
    );
    expect(await fs.readdir(path.join(launcher, "backups"))).toHaveLength(3);
  });

  it("still cleans stranded archives when the index is an empty list", async () => {
    const launcher = await prepare("[]");

    const result = await cleanupStorage("backups");

    expect(result.freed).toBe(8);
    expect(await fs.readdir(path.join(launcher, "backups"))).toEqual([
      "index.json",
    ]);
  });

  it("keeps an archive that the index still claims", async () => {
    const launcher = await prepare(
      JSON.stringify([record(ALIVE, "Pack"), record(STRANDED, "Removed Pack")]),
    );

    await cleanupStorage("backups");

    const left = await fs.readdir(path.join(launcher, "backups"));
    expect(left).toContain(`${ALIVE}.zip`);
    expect(left).not.toContain(`${STRANDED}.zip`);
  });
});
