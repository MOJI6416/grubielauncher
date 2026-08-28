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
  shell: { trashItem: async () => undefined },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: null,
  createWindow: () => null,
}));

const VANILLA_MAIN_CLASS = "net.minecraft.client.main.Main";
const FABRIC_MAIN_CLASS = "net.fabricmc.loader.impl.launch.knot.KnotClient";

function vanillaManifest() {
  return {
    id: "1.20.1",
    type: "release",
    mainClass: VANILLA_MAIN_CLASS,
    assetIndex: {
      id: "5",
      url: "https://piston-meta.mojang.com/v1/packages/5.json",
      sha1: "",
      size: 0,
    },
    downloads: {
      client: {
        url: "https://piston-data.mojang.com/v1/objects/client.jar",
        sha1: "",
        size: 0,
      },
    },
    libraries: [],
    arguments: { jvm: [], game: [] },
  };
}

function fabricManifest() {
  return {
    mainClass: FABRIC_MAIN_CLASS,
    arguments: { jvm: [], game: [] },
    libraries: [
      { name: "net.fabricmc:fabric-loader:0.15.0", url: "https://maven.fabricmc.net/" },
    ],
  };
}

vi.mock("../utilities/downloader", () => ({
  waitWhileDownloadsPaused: async () => {},
  Downloader: class {
    public versionName = "";
    public onInfo: unknown = null;

    async downloadFiles(items: { url: string; destination: string }[]) {
      for (const item of items) {
        await fs.ensureDir(path.dirname(item.destination));

        const destination = item.destination.replace(/\\/g, "/");

        if (destination.includes("/assets/indexes/")) {
          await fs.writeJSON(item.destination, { objects: {} });
          continue;
        }
        if (item.url.includes("meta.fabricmc.net")) {
          await fs.writeJSON(item.destination, fabricManifest());
          continue;
        }
        if (item.url.includes("piston-meta")) {
          await fs.writeJSON(item.destination, vanillaManifest());
          continue;
        }

        await fs.writeFile(item.destination, "binary");
      }

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
import { TSettings } from "@/types/Settings";

let root = "";
let versionPath = "";

const account = { type: "plain", nickname: "Tester" } as unknown as ILocalAccount;
const settings = { downloadLimit: 6, lang: "en" } as unknown as TSettings;

function conf(): IVersionConf {
  return {
    name: "FabricStand",
    version: {
      id: "1.20.1",
      url: "https://piston-meta.mojang.com/v1/packages/1.20.1.json",
      type: "release",
    },
    loader: {
      name: "fabric",
      mods: [],
      version: {
        id: "0.15.0",
        url: "https://meta.fabricmc.net/v2/versions/loader/1.20.1/0.15.0/profile/json",
      },
    },
  } as unknown as IVersionConf;
}

async function installedMainClass() {
  const manifest = await fs.readJSON(path.join(versionPath, "1.20.1.json"));
  return manifest.mainClass;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-install-"));
  hoisted.appData = root;
  versionPath = path.join(root, ".grubielauncher", "minecraft", "versions", "FabricStand");

  for (const release of ["jdk-17.0.19+10-jre", "jdk-21.0.11+10-jre"]) {
    const javaRoot = path.join(root, ".grubielauncher", "java", release);
    await fs.ensureDir(path.join(javaRoot, "bin"));
    await fs.writeFile(path.join(javaRoot, "bin", "javaw.exe"), "");
    await fs.writeFile(path.join(javaRoot, "bin", "java.exe"), "");
    await fs.writeFile(path.join(javaRoot, ".grubie-java-verified"), "");
  }
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("loader install", () => {
  it("merges the loader manifest on a clean install", async () => {
    const version = new Version(conf());
    await version.init();
    await version.install(settings, account);

    expect(await installedMainClass()).toBe(FABRIC_MAIN_CLASS);
  });

  it("merges the loader manifest when a bare game manifest was left behind", async () => {
    await fs.ensureDir(versionPath);
    await fs.writeJSON(path.join(versionPath, "1.20.1.json"), vanillaManifest());

    const version = new Version(conf());
    await version.init();
    await version.install(settings, account);

    expect(await installedMainClass()).toBe(FABRIC_MAIN_CLASS);
  });

  it("does not duplicate loader libraries when installed twice", async () => {
    const first = new Version(conf());
    await first.init();
    await first.install(settings, account);

    const afterFirst = await fs.readJSON(path.join(versionPath, "1.20.1.json"));

    const second = new Version(conf());
    await second.init();
    await second.install(settings, account);

    const afterSecond = await fs.readJSON(path.join(versionPath, "1.20.1.json"));

    expect(afterSecond.mainClass).toBe(FABRIC_MAIN_CLASS);
    expect(afterSecond.libraries.length).toBe(afterFirst.libraries.length);
  });
});
