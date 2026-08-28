import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";

const hoisted = vi.hoisted(() => ({ appData: "", sent: [] as { channel: string; payload: unknown }[] }));

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.appData },
  shell: { trashItem: async () => undefined },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => {
        hoisted.sent.push({ channel, payload });
      },
    },
  },
  createWindow: () => null,
}));

vi.mock("../utilities/downloader", () => ({
  waitWhileDownloadsPaused: async () => {},
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

import { Mods } from "./Mods";
import { IVersionConf } from "@/types/IVersion";
import { ProjectType } from "@/types/ModManager";
import { TSettings } from "@/types/Settings";

let root = "";
let versionPath = "";

const settings = { downloadLimit: 6, lang: "en" } as unknown as TSettings;

function makeConf(mods: unknown[] = []): IVersionConf {
  return {
    name: "TrashStand",
    version: { id: "1.20.1", url: "", type: "release" },
    loader: { name: "vanilla", mods },
  } as unknown as IVersionConf;
}

function worldMod(filename: string) {
  return {
    projectType: ProjectType.WORLD,
    version: {
      files: [
        {
          filename,
          url: `https://example.invalid/${filename}`,
          sha1: "",
          size: 0,
        },
      ],
    },
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-trash-"));
  hoisted.appData = root;
  hoisted.sent.length = 0;
  versionPath = path.join(root, ".grubielauncher", "minecraft", "versions", "TrashStand");
  await fs.ensureDir(versionPath);
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

async function trashEntries() {
  return await fs
    .readdir(path.join(versionPath, "storage", "trash"))
    .catch(() => [] as string[]);
}

describe("mod quarantine", () => {
  it("quarantines a downloaded world that left the pack", async () => {
    const world = path.join(versionPath, "saves", "MyBase");
    await fs.ensureDir(world);
    await fs.writeFile(path.join(world, ".downloaded"), "");
    await fs.writeFile(path.join(world, "level.dat"), "progress");

    await new Mods(settings, makeConf()).check();

    expect(await fs.pathExists(world)).toBe(false);
    const entries = await trashEntries();
    expect(entries.some((entry) => entry.endsWith("-MyBase"))).toBe(true);
  });

  it("never purges a quarantined folder on age alone", async () => {
    const trashPath = path.join(versionPath, "storage", "trash");
    const stale = Date.now() - 40 * 24 * 60 * 60 * 1000;
    const folder = path.join(trashPath, `${stale}-aabbccdd-MyBase`);
    const file = path.join(trashPath, `${stale}-aabbccdd-old-mod.jar`);

    await fs.ensureDir(folder);
    await fs.writeFile(path.join(folder, "level.dat"), "progress");
    await fs.writeFile(file, "jar");

    await new Mods(settings, makeConf()).check();

    expect(await fs.pathExists(folder)).toBe(true);
    expect(await fs.pathExists(file)).toBe(false);
  });

  it("keeps a played world when its archive never arrived", async () => {
    const world = path.join(versionPath, "saves", "MyBase");
    await fs.ensureDir(world);
    await fs.writeFile(path.join(world, ".downloaded"), "");
    await fs.writeFile(path.join(world, "level.dat"), "progress");

    await new Mods(settings, makeConf([worldMod("MyBase.zip")])).check();

    expect(await fs.pathExists(path.join(world, "level.dat"))).toBe(true);
    expect(await trashEntries()).toEqual([]);
  });

  it("keeps every world when a world archive cannot be read", async () => {
    const world = path.join(versionPath, "saves", "MyBase");
    await fs.ensureDir(world);
    await fs.writeFile(path.join(world, ".downloaded"), "");
    await fs.writeFile(path.join(world, "level.dat"), "progress");

    const archive = path.join(versionPath, "storage", "worlds", "MyBase.zip");
    await fs.ensureDir(path.dirname(archive));
    await fs.writeFile(archive, "not a zip");

    await expect(
      new Mods(settings, makeConf([worldMod("MyBase.zip")])).check(),
    ).resolves.toBeUndefined();

    expect(await fs.pathExists(path.join(world, "level.dat"))).toBe(true);
    expect(await trashEntries()).toEqual([]);
  });

  it("leaves a file in place when the quarantine cannot take it", async () => {
    const world = path.join(versionPath, "saves", "MyBase");
    await fs.ensureDir(world);
    await fs.writeFile(path.join(world, ".downloaded"), "");
    await fs.writeFile(path.join(world, "level.dat"), "progress");

    await fs.ensureDir(path.join(versionPath, "storage"));
    await fs.writeFile(path.join(versionPath, "storage", "trash"), "not a dir");

    await new Mods(settings, makeConf()).check();

    expect(await fs.pathExists(path.join(world, "level.dat"))).toBe(true);
    expect(await fs.readFile(path.join(versionPath, "storage", "trash"), "utf-8")).toBe(
      "not a dir",
    );
  });

  it("tells the player which files it moved out of the instance", async () => {
    const shader = path.join(versionPath, "shaderpacks", "MyShader.zip");
    await fs.ensureDir(path.dirname(shader));
    await fs.writeFile(shader, "zip");

    await new Mods(settings, makeConf()).check();

    expect(await fs.pathExists(shader)).toBe(false);

    const notice = hoisted.sent.find(
      (message) => message.channel === "mods:quarantined",
    );
    expect(notice?.payload).toMatchObject({ entries: ["MyShader.zip"] });
  });

  it("refuses to sync extra files for an instance it could not initialise", async () => {
    const conf = makeConf();
    (conf as unknown as { name: string }).name = "a".repeat(40);
    (conf.loader as unknown as { other: unknown }).other = {
      url: "https://example.invalid/other.zip",
    };

    await expect(new Mods(settings, conf).downloadOther()).rejects.toThrow(
      /initialization failed/,
    );
  });
});
