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

function skinPixels(): PNG {
  const png = new PNG({ width: 64, height: 64 });

  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = index % 251;
    png.data[index + 1] = (index * 7) % 253;
    png.data[index + 2] = (index * 13) % 255;
    png.data[index + 3] = 255;
  }

  return png;
}

function remoteUrl(filePath: string) {
  return `https://textures.example/asset?file=${encodeURIComponent(filePath)}`;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-skin-apply-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(root).catch(() => {});
});

describe("applying a skin to a Microsoft account", () => {
  it("keeps the uploaded skin active when the provider re-encodes its texture", async () => {
    const picked = PNG.sync.write(skinPixels(), { deflateLevel: 9 });
    const reencoded = PNG.sync.write(skinPixels(), {
      deflateLevel: 1,
      filterType: 0,
    });
    expect(picked.equals(reencoded)).toBe(false);

    const pickedPath = path.join(root, "skins", "picked.png");
    await fs.ensureDir(path.dirname(pickedPath));
    await fs.writeFile(pickedPath, picked);
    await fs.writeJSON(path.join(root, "skins", "index.json"), {
      skins: [
        {
          id: "picked",
          name: "Picked",
          model: "classic",
          url: pathToFileURL(pickedPath).href,
        },
      ],
      capes: [],
    });

    const texturePath = path.join(root, "remote", "texture.png");
    await fs.ensureDir(path.dirname(texturePath));
    await fs.writeFile(texturePath, reencoded);

    const manager = new SkinsManager(
      root,
      "microsoft",
      "user-1",
      "Nick",
      "token",
    );

    const profile: { name: string; skins: unknown[]; capes: unknown[] } = {
      name: "Nick",
      skins: [],
      capes: [],
    };

    vi.spyOn(manager.api, "get").mockImplementation(
      async () => ({ data: profile }) as never,
    );
    await manager.load();

    const [skin] = manager.getData().skins.skins;

    vi.spyOn(manager.api, "post").mockImplementation(async () => {
      profile.skins = [
        {
          id: "remote-uploaded",
          state: "ACTIVE",
          variant: "CLASSIC",
          url: remoteUrl(texturePath),
        },
      ];
      return { data: profile } as never;
    });
    vi.spyOn(manager.api, "delete").mockResolvedValue({ data: {} } as never);

    await expect(manager.uploadSkin(skin.id)).resolves.toBeUndefined();

    const data = manager.getData();
    expect(data.activeSkin).toBe(skin.id);
    expect(data.skins.skins).toHaveLength(1);
    expect(data.skins.skins[0].remoteId).toBe("remote-uploaded");
  });
});
