import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "" },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (buffer: Buffer) => buffer.toString(),
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: null,
  createWindow: () => null,
}));

vi.mock("../utilities/downloader", () => ({
  Downloader: class {
    async downloadFiles() {
      return null;
    }
    cancelDownload() {
      return undefined;
    }
  },
}));

import fs from "fs-extra";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { PNG } from "pngjs";
import { SkinsManager } from "./SkinsManager";

let root = "";

function pngBuffer(width: number, height: number, fill = 255): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(fill);
  return PNG.sync.write(png);
}

async function writeAsset(
  folder: string,
  name: string,
  buffer: Buffer,
): Promise<string> {
  const filePath = path.join(root, "skins", folder, `${name}.png`);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buffer);
  return filePath;
}

function indexPath() {
  return path.join(root, "skins", "index.json");
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-wardrobe-"));
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("wardrobe selection", () => {
  it("has a selected skin right after loading", async () => {
    const stored = await writeAsset(".", "Mine", pngBuffer(64, 64));
    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "Mine",
          name: "Mine",
          model: "classic",
          url: pathToFileURL(stored).href,
        },
      ],
      capes: [],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();

    const data = manager.getData();
    expect(data.selectedSkin).toBe(data.skins.skins[0].id);

    await manager.changeModel("slim");
    expect(manager.getData().skins.skins[0].model).toBe("slim");
  });

  it("keeps the wardrobe selection after the selected skin is deleted", async () => {
    const first = await writeAsset(".", "First", pngBuffer(64, 64, 10));
    const second = await writeAsset(".", "Second", pngBuffer(64, 64, 200));
    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "First",
          name: "First",
          model: "classic",
          url: pathToFileURL(first).href,
        },
        {
          id: "Second",
          name: "Second",
          model: "classic",
          url: pathToFileURL(second).href,
        },
      ],
      capes: [],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();

    const selected = manager.getData().selectedSkin;
    expect(selected).toBeTruthy();

    await manager.deleteSkin(selected as string, "skin");

    const data = manager.getData();
    expect(data.skins.skins).toHaveLength(1);
    expect(data.selectedSkin).toBe(data.skins.skins[0].id);

    await expect(manager.changeModel("slim")).resolves.toBeUndefined();
    await expect(manager.setCapeId(undefined)).resolves.toBeUndefined();
  });

  it("refuses to change the model when the wardrobe is empty", async () => {
    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();

    await expect(manager.changeModel("slim")).rejects.toThrow(
      "skin_not_selected",
    );
    await expect(manager.setCapeId(undefined)).rejects.toThrow(
      "skin_not_selected",
    );
  });
});

describe("cape entries", () => {
  it("keeps a stored cape whose file turned out to be unreadable", async () => {
    const skin = await writeAsset(".", "Mine", pngBuffer(64, 64));
    const broken = path.join(root, "skins", "capes", "broken.png");
    await fs.ensureDir(path.dirname(broken));
    await fs.writeFile(broken, "not a png at all");

    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "Mine",
          name: "Mine",
          model: "classic",
          url: pathToFileURL(skin).href,
        },
      ],
      capes: [
        {
          id: "broken",
          alias: "My favourite cape",
          url: pathToFileURL(broken).href,
        },
      ],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();

    const saved = await fs.readJSON(indexPath());
    expect(
      saved.capes.map((entry: { alias?: string }) => entry.alias),
    ).toEqual(["My favourite cape"]);
  });
});

describe("microsoft cape choice", () => {
  it("does not bring back a cape the player took off", async () => {
    const skin = await writeAsset(".", "Mine", pngBuffer(64, 64));
    const cape = await writeAsset("capes", "worn", pngBuffer(64, 32, 120));

    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "Mine",
          name: "Mine",
          model: "classic",
          url: pathToFileURL(skin).href,
        },
      ],
      capes: [
        {
          id: "worn",
          alias: "Worn",
          remoteId: "remote-worn",
          url: pathToFileURL(cape).href,
        },
      ],
    });

    const manager = new SkinsManager(
      root,
      "microsoft",
      "user-1",
      "Nick",
      "token",
    );
    vi.spyOn(
      manager as unknown as { getMojangSkins: () => Promise<boolean> },
      "getMojangSkins",
    ).mockResolvedValue(false);
    await manager.load();

    const capeId = manager.getData().capes[0].id;
    await manager.setCapeId(capeId);
    await manager.saveSkins();
    expect((await fs.readJSON(indexPath())).skins[0].capeId).toBe(capeId);

    const restarted = new SkinsManager(
      root,
      "microsoft",
      "user-1",
      "Nick",
      "token",
    );
    vi.spyOn(
      restarted as unknown as { getMojangSkins: () => Promise<boolean> },
      "getMojangSkins",
    ).mockResolvedValue(false);
    await restarted.load();
    expect(restarted.getData().skins.skins[0].capeId).toBe(capeId);

    await restarted.setCapeId(undefined);
    await restarted.saveSkins();
    expect((await fs.readJSON(indexPath())).skins[0].capeId).toBeUndefined();
  });
});
