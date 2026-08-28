import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";

const hoisted = vi.hoisted(() => ({ appData: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => hoisted.appData,
    getVersion: () => "2.0.0",
    isReady: () => true,
    whenReady: async () => undefined,
    on: () => undefined,
  },
  shell: {
    trashItem: async () => {
      throw new Error("no trash in tests");
    },
  },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: null,
  createWindow: () => null,
}));

vi.mock("../utilities/downloader", () => ({
  Downloader: class {
    public versionName = "";
    public onInfo: unknown = null;
    async downloadFiles() {
      return null;
    }
    cancelDownload() {
      return undefined;
    }
  },
}));

import { Version } from "./Version";
import { IVersionConf } from "@/types/IVersion";
import { ILocalAccount } from "@/types/Account";

let root = "";
let minecraftPath = "";

const account = {
  type: "plain",
  nickname: "Tester",
} as unknown as ILocalAccount;

const SHARED_LIB = "org/shared/shared-1.0.jar";
const OWN_LIB = "org/own/own-1.0.jar";

function conf(name: string): IVersionConf {
  return {
    name,
    version: { id: "1.20.1", url: "", type: "release" },
    loader: { name: "vanilla", mods: [] },
  } as unknown as IVersionConf;
}

function manifest(libraryPaths: string[]) {
  return {
    id: "1.20.1",
    type: "release",
    mainClass: "net.minecraft.client.main.Main",
    assetIndex: { id: "5", url: "", sha1: "", size: 0 },
    downloads: { client: { url: "", sha1: "", size: 0 } },
    libraries: libraryPaths.map((artifactPath) => ({
      name: artifactPath.replace(/\//g, ":"),
      downloads: { artifact: { url: "", path: artifactPath, size: 0, sha1: "" } },
    })),
  };
}

async function writeInstance(name: string, libraryPaths: string[]) {
  const versionPath = path.join(minecraftPath, "versions", name);
  await fs.ensureDir(versionPath);
  await fs.writeJSON(path.join(versionPath, "1.20.1.json"), manifest(libraryPaths));
  return versionPath;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-del-"));
  hoisted.appData = root;
  minecraftPath = path.join(root, ".grubielauncher", "minecraft");

  for (const artifactPath of [SHARED_LIB, OWN_LIB]) {
    const filePath = path.join(minecraftPath, "libraries", artifactPath);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, "jar");
  }
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("full instance delete", () => {
  it("keeps a library another instance still lists", async () => {
    const removed = await writeInstance("Removed", [SHARED_LIB, OWN_LIB]);
    await writeInstance("Kept", [SHARED_LIB]);

    const version = new Version(conf("Removed"));
    await version.init();
    await version.delete(account, true);

    expect(await fs.pathExists(removed)).toBe(false);
    expect(
      await fs.pathExists(path.join(minecraftPath, "libraries", SHARED_LIB)),
    ).toBe(true);
    expect(
      await fs.pathExists(path.join(minecraftPath, "libraries", OWN_LIB)),
    ).toBe(false);
  });

  it("keeps shared libraries when a neighbour manifest cannot be read", async () => {
    const removed = await writeInstance("Removed", [SHARED_LIB, OWN_LIB]);
    const kept = await writeInstance("Kept", [SHARED_LIB]);
    await fs.writeFile(path.join(kept, "1.20.1.json"), "{ broken", "utf-8");

    const version = new Version(conf("Removed"));
    await version.init();
    await version.delete(account, true);

    expect(await fs.pathExists(removed)).toBe(false);
    expect(
      await fs.pathExists(path.join(minecraftPath, "libraries", SHARED_LIB)),
    ).toBe(true);
  });

  it("still removes the instance when its own asset index is unreadable", async () => {
    const removed = await writeInstance("Removed", [OWN_LIB]);
    const indexPath = path.join(minecraftPath, "assets", "indexes", "5.json");
    await fs.ensureDir(path.dirname(indexPath));
    await fs.writeFile(indexPath, "{ broken", "utf-8");

    const version = new Version(conf("Removed"));
    await version.init();

    await expect(version.delete(account, true)).resolves.toEqual({
      deleted: true,
      trashed: false,
    });
    expect(await fs.pathExists(removed)).toBe(false);
  });
});
