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

function jarMod(filename: string) {
  return {
    title: filename,
    id: filename,
    provider: "local",
    projectType: ProjectType.MOD,
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

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-managed-"));
  hoisted.appData = root;
  hoisted.sent.length = 0;
  versionPath = path.join(root, ".grubielauncher", "minecraft", "versions", "TrashStand");
  await fs.ensureDir(path.join(versionPath, "mods"));
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

async function writeMods(...names: string[]) {
  for (const name of names) {
    await fs.writeFile(path.join(versionPath, "mods", name), "jar");
  }
}

async function saveConf(mods: unknown[]) {
  await fs.writeJSON(path.join(versionPath, "version.json"), makeConf(mods));
}

function modExists(name: string) {
  return fs.pathExists(path.join(versionPath, "mods", name));
}

describe("files the player added by hand", () => {
  it("keeps a jar dropped into the mods folder", async () => {
    await saveConf([jarMod("a.jar")]);
    await writeMods("a.jar", "manual.jar", "muted.jar.disabled");

    await new Mods(settings, makeConf([jarMod("a.jar")])).check();

    expect(await modExists("manual.jar")).toBe(true);
    expect(await modExists("muted.jar.disabled")).toBe(true);
    expect(
      hoisted.sent.some((message) => message.channel === "mods:quarantined"),
    ).toBe(false);
  });

  it("still quarantines a mod removed in the launcher", async () => {
    await saveConf([jarMod("a.jar"), jarMod("b.jar")]);
    await writeMods("a.jar", "b.jar", "manual.jar");

    await new Mods(settings, makeConf([jarMod("a.jar")])).check();

    expect(await modExists("b.jar")).toBe(false);
    expect(await modExists("manual.jar")).toBe(true);
  });

  it("remembers what it placed even without the saved settings", async () => {
    await writeMods("a.jar", "b.jar");
    await new Mods(settings, makeConf([jarMod("a.jar"), jarMod("b.jar")])).check();

    await writeMods("manual.jar");
    await new Mods(settings, makeConf([jarMod("a.jar")])).check();

    expect(await modExists("b.jar")).toBe(false);
    expect(await modExists("manual.jar")).toBe(true);
  });

  it("takes over a manual file once it is added to the instance", async () => {
    await saveConf([jarMod("a.jar")]);
    await writeMods("a.jar", "manual.jar");

    await new Mods(settings, makeConf([jarMod("a.jar"), jarMod("manual.jar")])).check();
    await new Mods(settings, makeConf([jarMod("a.jar")])).check();

    expect(await modExists("manual.jar")).toBe(false);
  });
});
