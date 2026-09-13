import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";

const hoisted = vi.hoisted(() => ({
  appData: "",
  downloads: [] as string[],
  failUrl: null as string | null,
  loaderIdOverride: null as string | null,
}));

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

const FABRIC_MAIN_CLASS = "net.fabricmc.loader.impl.launch.knot.KnotClient";

function vanillaManifest() {
  return {
    id: "1.20.1",
    type: "release",
    mainClass: "net.minecraft.client.main.Main",
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

function fabricProfile(loaderId: string) {
  return {
    mainClass: FABRIC_MAIN_CLASS,
    arguments: { jvm: [], game: [] },
    libraries: [
      {
        name: `net.fabricmc:fabric-loader:${loaderId}`,
        url: "https://maven.fabricmc.net/",
      },
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
        hoisted.downloads.push(item.url);

        if (hoisted.failUrl && item.url.includes(hoisted.failUrl)) {
          throw new Error(`Failed to download ${item.url}`);
        }

        await fs.ensureDir(path.dirname(item.destination));
        const destination = item.destination.replace(/\\/g, "/");

        if (destination.includes("/assets/indexes/")) {
          await fs.writeJSON(item.destination, { objects: {} });
          continue;
        }

        const loader = /\/loader\/[^/]+\/([^/]+)\/profile\/json/.exec(item.url);
        if (loader) {
          await fs.writeJSON(
            item.destination,
            fabricProfile(hoisted.loaderIdOverride ?? loader[1]),
          );
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
import { changeLoaderVersion, readLoaderRollback } from "./loaderChange";
import { IVersionConf } from "@/types/IVersion";
import { ILocalAccount } from "@/types/Account";
import { TSettings } from "@/types/Settings";
import {
  LOADER_CHANGE_UNVERIFIED,
  VERSION_INSTALL_CANCELLED,
} from "@/types/InstallationProgress";

const account = { type: "plain", nickname: "Tester" } as unknown as ILocalAccount;
const settings = { downloadLimit: 6, lang: "en" } as unknown as TSettings;

let root = "";
let versionPath = "";

function build(id: string) {
  return {
    id,
    url: `https://meta.fabricmc.net/v2/versions/loader/1.20.1/${id}/profile/json`,
  };
}

function conf(loaderId = "0.15.0"): IVersionConf {
  return {
    name: "FabricStand",
    version: {
      id: "1.20.1",
      url: "https://piston-meta.mojang.com/v1/packages/1.20.1.json",
      type: "release",
    },
    loader: { name: "fabric", mods: [], version: build(loaderId) },
  } as unknown as IVersionConf;
}

async function installInitial() {
  const version = new Version(conf());
  await version.init();
  await version.install(settings, account);
  await version.save();
}

async function liveLoaderLibraries() {
  const manifest = await fs.readJSON(path.join(versionPath, "1.20.1.json"));
  return manifest.libraries
    .map((library: { name: string }) => library.name)
    .filter((name: string) => name.startsWith("net.fabricmc:fabric-loader"));
}

async function savedLoaderId() {
  const saved = await fs.readJSON(path.join(versionPath, "version.json"));
  return saved.loader.version.id;
}

function change(target: string, from: IVersionConf, signal?: AbortSignal) {
  return changeLoaderVersion({
    versionPath,
    conf: from,
    build: build(target),
    settings,
    account,
    signal: signal ?? new AbortController().signal,
  });
}

const JAVA_BIN_DIR =
  process.platform === "darwin" ? path.join("Contents", "Home", "bin") : "bin";
const CLIENT_BINARY = process.platform === "win32" ? "javaw.exe" : "java";
const SERVER_BINARY = process.platform === "win32" ? "java.exe" : "java";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-loader-"));
  hoisted.appData = root;
  hoisted.downloads = [];
  hoisted.failUrl = null;
  hoisted.loaderIdOverride = null;
  versionPath = path.join(
    root,
    ".grubielauncher",
    "minecraft",
    "versions",
    "FabricStand",
  );

  for (const release of ["jdk-17.0.19+10-jre", "jdk-21.0.11+10-jre"]) {
    const javaRoot = path.join(root, ".grubielauncher", "java", release);
    const binDir = path.join(javaRoot, JAVA_BIN_DIR);
    await fs.ensureDir(binDir);
    await fs.writeFile(path.join(binDir, CLIENT_BINARY), "");
    await fs.writeFile(path.join(binDir, SERVER_BINARY), "");
    await fs.writeFile(path.join(javaRoot, ".grubie-java-verified"), "");
  }

  await installInitial();
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("changeLoaderVersion", () => {
  it("swaps in the new build and keeps the previous one for rollback", async () => {
    const next = await change("0.16.10", conf());

    expect(next.loader.version?.id).toBe("0.16.10");
    expect(await liveLoaderLibraries()).toEqual([
      "net.fabricmc:fabric-loader:0.16.10",
    ]);
    expect(await savedLoaderId()).toBe("0.16.10");
    expect((await readLoaderRollback(versionPath, next))?.id).toBe("0.15.0");
    expect(
      await fs.pathExists(path.join(versionPath, "storage", "loader-staging")),
    ).toBe(false);
  });

  it("leaves the instance untouched when the new build fails to download", async () => {
    hoisted.failUrl = "/0.16.10/";

    await expect(change("0.16.10", conf())).rejects.toThrow();

    expect(await liveLoaderLibraries()).toEqual([
      "net.fabricmc:fabric-loader:0.15.0",
    ]);
    expect(await savedLoaderId()).toBe("0.15.0");
    expect(await readLoaderRollback(versionPath, conf())).toBeNull();
    expect(
      await fs.pathExists(path.join(versionPath, "storage", "loader-staging")),
    ).toBe(false);
  });

  it("refuses a build whose manifest does not carry the requested version", async () => {
    hoisted.loaderIdOverride = "0.15.0";

    await expect(change("0.16.10", conf())).rejects.toThrow(
      LOADER_CHANGE_UNVERIFIED,
    );

    expect(await savedLoaderId()).toBe("0.15.0");
    expect(await readLoaderRollback(versionPath, conf())).toBeNull();
  });

  it("does not touch the instance when the change is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(change("0.16.10", conf(), controller.signal)).rejects.toThrow(
      VERSION_INSTALL_CANCELLED,
    );

    expect(await liveLoaderLibraries()).toEqual([
      "net.fabricmc:fabric-loader:0.15.0",
    ]);
    expect(await savedLoaderId()).toBe("0.15.0");
  });

  it("rolls back from the saved snapshot without fetching the loader again", async () => {
    const updated = await change("0.16.10", conf());
    hoisted.downloads = [];

    const restored = await change("0.15.0", updated);

    expect(restored.loader.version?.id).toBe("0.15.0");
    expect(await liveLoaderLibraries()).toEqual([
      "net.fabricmc:fabric-loader:0.15.0",
    ]);
    expect(
      hoisted.downloads.some((url) => url.includes("meta.fabricmc.net")),
    ).toBe(false);
    expect((await readLoaderRollback(versionPath, restored))?.id).toBe(
      "0.16.10",
    );
  });

  it("ignores a snapshot left by another Minecraft version", async () => {
    await change("0.16.10", conf());

    const otherGame = {
      ...conf("0.16.10"),
      version: { ...conf().version, id: "1.21.1" },
    } as IVersionConf;

    expect(await readLoaderRollback(versionPath, otherGame)).toBeNull();
  });
});
