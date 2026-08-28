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
    async downloadFiles(
      items: { url: string; destination: string }[],
    ): Promise<null> {
      for (const item of items) {
        const source = new URL(item.url).searchParams.get("file") || "";
        await fs.ensureDir(path.dirname(item.destination));
        await fs.copyFile(source, item.destination);
      }

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

async function writeRemote(name: string, buffer: Buffer): Promise<string> {
  const filePath = path.join(root, "remote", `${name}.png`);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buffer);
  return filePath;
}

function indexPath() {
  return path.join(root, "skins", "index.json");
}

function remoteUrl(filePath: string) {
  return `https://textures.example/asset?file=${encodeURIComponent(filePath)}`;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-capes-"));
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("microsoft cape index migration", () => {
  it("does not keep a legacy twin of every cape the provider returned", async () => {
    const skin = await writeAsset(".", "legacy-skin-1", pngBuffer(64, 64, 30));
    const remoteSkin = await writeRemote("skin", pngBuffer(64, 64, 30));
    const cape = await writeAsset(
      "capes",
      "legacy-cape-1",
      pngBuffer(64, 32, 90),
    );
    const remoteCape1 = await writeRemote("cape", pngBuffer(64, 32, 90));

    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "legacy-skin-1",
          name: "My skin 1",
          model: "classic",
          url: pathToFileURL(skin).href,
        },
      ],
      capes: [
        {
          id: "legacy-cape-1",
          alias: "My cape 1",
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

    vi.spyOn(manager.api, "get").mockResolvedValue({
      data: {
        name: "Nick",
        skins: [
          {
            id: "remote-skin",
            url: remoteUrl(remoteSkin),
            variant: "CLASSIC",
            state: "ACTIVE",
          },
        ],
        capes: [
          {
            id: "remote-cape",
            alias: "My cape 1",
            url: remoteUrl(remoteCape1),
            state: "ACTIVE",
          },
        ],
      },
    } as never);

    await manager.load();

    expect(manager.getData().capes).toHaveLength(1);

    const saved = await fs.readJSON(indexPath());
    expect(saved.capes).toHaveLength(1);
    expect(saved.capes[0].remoteId).toBe("remote-cape");
    expect(await fs.pathExists(cape)).toBe(false);
  });

  it("keeps a stored cape whose file is not a copy of a live one", async () => {
    const skin = await writeAsset(".", "legacy-skin-1", pngBuffer(64, 64, 30));
    const worn = await writeAsset(
      "capes",
      "legacy-cape-1",
      pngBuffer(64, 32, 90),
    );
    const remoteCape = await writeRemote("cape", pngBuffer(64, 32, 90));
    const other = await writeAsset(
      "capes",
      "legacy-cape-2",
      pngBuffer(64, 32, 40),
    );

    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "legacy-skin-1",
          name: "My skin 1",
          model: "classic",
          url: pathToFileURL(skin).href,
        },
      ],
      capes: [
        {
          id: "legacy-cape-1",
          alias: "My cape 1",
          url: pathToFileURL(worn).href,
        },
        {
          id: "legacy-cape-2",
          alias: "My cape 2",
          url: pathToFileURL(other).href,
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

    vi.spyOn(manager.api, "get").mockResolvedValue({
      data: {
        name: "Nick",
        skins: [],
        capes: [
          {
            id: "remote-cape",
            alias: "My cape 1",
            url: remoteUrl(remoteCape),
            state: "ACTIVE",
          },
        ],
      },
    } as never);

    await manager.load();

    const saved = await fs.readJSON(indexPath());
    expect(saved.capes).toHaveLength(2);
    expect(
      saved.capes.map((entry: { alias?: string }) => entry.alias),
    ).toContain("My cape 2");
    expect(await fs.pathExists(other)).toBe(true);
  });
});
