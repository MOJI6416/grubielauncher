import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import type { ChildProcessWithoutNullStreams } from "child_process";

const hoisted = vi.hoisted(() => ({
  appData: "",
  downloads: [] as string[],
}));

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.appData },
  shell: { trashItem: async () => undefined },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: () => undefined },
  },
  createWindow: () => null,
}));

vi.mock("../utilities/downloader", () => ({
  waitWhileDownloadsPaused: async () => {},
  Downloader: class {
    public versionName = "";
    public onInfo: unknown = null;
    async downloadFiles(items: { destination: string }[]) {
      hoisted.downloads.push(...items.map((item) => item.destination));
      return null;
    }
    cancelDownload() {
      return undefined;
    }
  },
}));

import { Mods } from "./Mods";
import { gameProcesses } from "../utilities/runtime";
import { IVersionConf } from "@/types/IVersion";
import { ProjectType } from "@/types/ModManager";
import { TSettings } from "@/types/Settings";

let root = "";
let versionPath = "";

const settings = { downloadLimit: 6, lang: "en" } as unknown as TSettings;
const GAME_KEY = "running-stand";

function makeConf(mods: unknown[] = []): IVersionConf {
  return {
    name: "RunningStand",
    version: { id: "1.20.1", url: "", type: "release" },
    loader: { name: "fabric", mods },
  } as unknown as IVersionConf;
}

function project(filename: string, projectType = ProjectType.MOD) {
  return {
    title: filename,
    id: filename,
    provider: "local",
    projectType,
    version: {
      id: "1",
      dependencies: [],
      files: [
        {
          filename,
          url: `https://example.invalid/${filename}`,
          sha1: "",
          size: 0,
          isServer: true,
        },
      ],
    },
  };
}

function startGame() {
  gameProcesses.set(GAME_KEY, {
    process: { exitCode: null } as unknown as ChildProcessWithoutNullStreams,
    versionName: "RunningStand",
    instance: 1,
    versionPath,
    serverPort: null,
    accessToken: "",
  });
}

function inFolder(folder: string, name: string) {
  return path.join(versionPath, folder, name);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-running-"));
  hoisted.appData = root;
  hoisted.downloads.length = 0;
  versionPath = path.join(
    root,
    ".grubielauncher",
    "minecraft",
    "versions",
    "RunningStand",
  );
  await fs.ensureDir(path.join(versionPath, "mods"));
  await fs.ensureDir(path.join(versionPath, "resourcepacks"));
});

afterEach(async () => {
  gameProcesses.delete(GAME_KEY);
  await fs.remove(root).catch(() => {});
});

describe("content check while the instance is running", () => {
  it("leaves the mods folder alone and only adds packs", async () => {
    await fs.writeJSON(
      path.join(versionPath, "version.json"),
      makeConf([project("a.jar"), project("b.jar")]),
    );
    await fs.writeFile(inFolder("mods", "a.jar"), "jar");
    await fs.writeFile(inFolder("mods", "b.jar"), "jar");
    startGame();

    await new Mods(
      settings,
      makeConf([
        project("a.jar"),
        project("c.jar"),
        project("pack.zip", ProjectType.RESOURCEPACK),
      ]),
    ).check();

    expect(await fs.pathExists(inFolder("mods", "b.jar"))).toBe(true);
    expect(hoisted.downloads).toEqual([inFolder("resourcepacks", "pack.zip")]);
  });

  it("syncs the mods again once the game has closed", async () => {
    await fs.writeJSON(
      path.join(versionPath, "version.json"),
      makeConf([project("a.jar"), project("b.jar")]),
    );
    await fs.writeFile(inFolder("mods", "a.jar"), "jar");
    await fs.writeFile(inFolder("mods", "b.jar"), "jar");
    startGame();
    await new Mods(settings, makeConf([project("a.jar")])).check();
    gameProcesses.delete(GAME_KEY);

    await new Mods(settings, makeConf([project("a.jar")])).check();

    expect(await fs.pathExists(inFolder("mods", "b.jar"))).toBe(false);
  });
});
