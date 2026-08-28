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
import { fileURLToPath, pathToFileURL } from "url";
import { PNG } from "pngjs";
import { SkinsManager } from "./SkinsManager";

let root = "";

function pngBuffer(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return PNG.sync.write(png);
}

async function writeSkin(name: string, buffer: Buffer) {
  const filePath = path.join(root, "skins", `${name}.png`);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buffer);
  return filePath;
}

function indexPath() {
  return path.join(root, "skins", "index.json");
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-skins-"));
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("skins index resilience", () => {
  it("keeps the wardrobe when one stored skin file is unusable", async () => {
    const good = await writeSkin("good", pngBuffer(64, 64));
    const bad = await writeSkin("bad", pngBuffer(16, 16));

    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "good",
          name: "Good one",
          model: "classic",
          url: pathToFileURL(good).href,
        },
        {
          id: "bad",
          name: "Broken",
          model: "classic",
          url: pathToFileURL(bad).href,
        },
      ],
      capes: [],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();

    expect(manager.getData().skins.skins.map((skin) => skin.name)).toContain(
      "Good one",
    );

    const saved = await fs.readJSON(indexPath());
    expect(saved.skins.map((skin: { name: string }) => skin.name)).toEqual(
      expect.arrayContaining(["Good one", "Broken"]),
    );
  });

  it("does not overwrite an index it could not read", async () => {
    await writeSkin("good", pngBuffer(64, 64));
    await fs.writeFile(indexPath(), "{ this is not json", "utf-8");

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");

    await expect(manager.load()).rejects.toThrow();
    expect(await fs.readFile(indexPath(), "utf-8")).toBe("{ this is not json");
  });

  it("writes the index before anything can interrupt the load", async () => {
    const stored = await writeSkin("MyFavourite", pngBuffer(64, 64));

    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "MyFavourite",
          name: "My favourite",
          model: "classic",
          url: pathToFileURL(stored).href,
        },
      ],
      capes: [],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    vi.spyOn(
      manager as unknown as { checkSkins: () => Promise<void> },
      "checkSkins",
    ).mockRejectedValue(new Error("launcher closed"));

    await expect(manager.load()).rejects.toThrow("launcher closed");

    expect(await fs.pathExists(stored)).toBe(false);

    const saved = await fs.readJSON(indexPath());
    expect(saved.skins).toHaveLength(1);
    expect(saved.skins[0].name).toBe("My favourite");
    expect(await fs.pathExists(fileURLToPath(saved.skins[0].url))).toBe(true);

    const restarted = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await restarted.load();
    expect(
      restarted.getData().skins.skins.map((skin) => skin.name),
    ).toEqual(["My favourite"]);
  });

  it("keeps a stored skin whose file went missing", async () => {
    await fs.ensureDir(path.join(root, "skins"));
    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "gone",
          hash: "gone",
          name: "Vanished",
          model: "classic",
          url: pathToFileURL(path.join(root, "skins", "gone.png")).href,
        },
      ],
      capes: [],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();

    const saved = await fs.readJSON(indexPath());
    expect(saved.skins.map((skin: { name: string }) => skin.name)).toEqual([
      "Vanished",
    ]);
  });

  it("keeps a skin another account added while this one was open", async () => {
    const mine = await writeSkin("Mine", pngBuffer(64, 64));
    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "Mine",
          name: "Mine",
          model: "classic",
          url: pathToFileURL(mine).href,
        },
      ],
      capes: [],
    });

    const first = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await first.load();

    const second = new SkinsManager(root, "elyby", "user-2", "Other", "token");
    await second.load();
    const theirs = await writeSkin("Theirs", pngBuffer(64, 32));
    const saved = await fs.readJSON(indexPath());
    saved.skins.push({
      id: "Theirs",
      name: "Theirs",
      model: "classic",
      url: pathToFileURL(theirs).href,
    });
    await fs.writeJSON(indexPath(), saved);

    await first.renameSkin(first.getData().skins.skins[0].id, "Mine renamed");

    const after = await fs.readJSON(indexPath());
    expect(after.skins.map((skin: { name: string }) => skin.name).sort()).toEqual([
      "Mine renamed",
      "Theirs",
    ]);
  });

  it("does not resurrect a skin this account deleted", async () => {
    const mine = await writeSkin("Mine", pngBuffer(64, 64));
    await fs.writeJSON(indexPath(), {
      skins: [
        {
          id: "Mine",
          name: "Mine",
          model: "classic",
          url: pathToFileURL(mine).href,
        },
      ],
      capes: [],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();
    await manager.deleteSkin(manager.getData().skins.skins[0].id);

    expect((await fs.readJSON(indexPath())).skins).toEqual([]);
  });
});
