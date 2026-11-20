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

const server = vi.hoisted(() => ({
  items: new Map<string, Record<string, unknown> & { data: Buffer }>(),
  calls: [] as string[],
}));

vi.mock("../utilities/accountSyncClient", () => {
  const key = (kind: string, hash: string) => `${kind}:${hash}`;
  const view = ({ data: _data, ...item }: Record<string, unknown>) => item;
  return {
    accountSyncApi: {
      listWardrobe: async () => ({
        ok: true,
        data: { items: [...server.items.values()].map(view) },
      }),
      putWardrobeItem: async (
        _token: string,
        kind: string,
        hash: string,
        body: Record<string, unknown>,
      ) => {
        server.calls.push(`put ${kind} ${body.data ? "data" : "meta"}`);
        const existing = server.items.get(key(kind, hash));
        const changedAt = Math.min(Number(body.changedAt), Date.now());
        if (!existing && !body.data) return { ok: false, reason: "data_required" };
        if (existing && changedAt <= Number(existing.changedAt)) {
          return { ok: true, data: view(existing) };
        }
        const item = {
          kind,
          hash,
          name: body.name,
          model: kind === "skin" ? body.model : null,
          cape: kind === "skin" ? (body.cape ?? null) : null,
          changedAt,
          data: existing?.data ?? Buffer.from(String(body.data), "base64"),
        };
        server.items.set(key(kind, hash), item);
        return { ok: true, data: view(item) };
      },
      wardrobeTexture: async (_token: string, kind: string, hash: string) => {
        const item = server.items.get(key(kind, hash));
        return item
          ? { ok: true, data: item.data.buffer.slice(item.data.byteOffset, item.data.byteOffset + item.data.length) }
          : { ok: false, reason: "unsupported" };
      },
      deleteWardrobeItem: async (_token: string, kind: string, hash: string) => {
        server.calls.push(`delete ${kind}`);
        server.items.delete(key(kind, hash));
        return { ok: true, data: { ok: true } };
      },
    },
  };
});

import fs from "fs-extra";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { pathToFileURL } from "url";
import { PNG } from "pngjs";
import { SkinsManager } from "./SkinsManager";
import {
  applyWardrobeEdits,
  planWardrobeSync,
  syncWardrobe,
  type LocalWardrobeItem,
  type WardrobeBase,
} from "./wardrobeSync";
import type { RemoteWardrobeItem } from "@/types/AccountSync";

const USER = "64f000000000000000000001";

function png(width: number, height: number, fill: number): Buffer {
  const image = new PNG({ width, height });
  image.data.fill(fill);
  return PNG.sync.write(image);
}

const sha1 = (data: Buffer) => createHash("sha1").update(data).digest("hex");

const A = "a".repeat(40);
const B = "b".repeat(40);

function local(hash: string, patch: Partial<LocalWardrobeItem> = {}): LocalWardrobeItem {
  return {
    kind: "skin",
    hash,
    name: "Steve",
    model: "classic",
    cape: null,
    updatedAt: 100,
    hasFile: true,
    ...patch,
  };
}

function remote(hash: string, patch: Partial<RemoteWardrobeItem> = {}): RemoteWardrobeItem {
  return {
    kind: "skin",
    hash,
    name: "Steve",
    model: "classic",
    cape: null,
    changedAt: 100,
    ...patch,
  };
}

const base = (skin: Record<string, number> = {}): WardrobeBase => ({ skin, cape: {} });

describe("planWardrobeSync", () => {
  it("uploads new files and downloads the account's", () => {
    expect(planWardrobeSync([local(A)], [remote(B)], base())).toEqual([
      { type: "upload", item: local(A), withData: true },
      { type: "download", remote: remote(B) },
    ]);
  });

  it("only records a file both sides already agree on", () => {
    expect(planWardrobeSync([local(A)], [remote(A, { changedAt: 300 })], base())).toEqual([
      { type: "record", kind: "skin", hash: A, changedAt: 300 },
    ]);
    expect(planWardrobeSync([local(A)], [remote(A)], base({ [A]: 100 }))).toEqual([]);
  });

  it("lets the later rename win", () => {
    const there = remote(A, { name: "Alex", changedAt: 200 });
    expect(planWardrobeSync([local(A, { updatedAt: 300 })], [there], base({ [A]: 100 }))).toEqual([
      { type: "upload", item: local(A, { updatedAt: 300 }), withData: false },
    ]);
    expect(planWardrobeSync([local(A, { updatedAt: 150 })], [there], base({ [A]: 100 }))).toEqual([
      { type: "apply", remote: there },
    ]);
  });

  it("takes the launcher's own dedupe suffix for the same name", () => {
    expect(
      planWardrobeSync([local(A, { name: `Steve-${A.slice(0, 6)}` })], [remote(A)], base({ [A]: 100 })),
    ).toEqual([]);
  });

  it("propagates deletions both ways through the last synced state", () => {
    expect(planWardrobeSync([], [remote(A)], base({ [A]: 100 }))).toEqual([
      { type: "deleteRemote", kind: "skin", hash: A },
    ]);
    expect(planWardrobeSync([local(A)], [], base({ [A]: 100 }))).toEqual([
      { type: "deleteLocal", kind: "skin", hash: A },
    ]);
  });

  it("keeps a file deleted elsewhere when it was edited here since", () => {
    expect(planWardrobeSync([local(A, { updatedAt: 500 })], [], base({ [A]: 100 }))).toEqual([
      { type: "upload", item: local(A, { updatedAt: 500 }), withData: true },
    ]);
  });

  it("restores a missing file from the account and never deletes it there", () => {
    expect(planWardrobeSync([local(A, { hasFile: false })], [remote(A)], base({ [A]: 100 }))).toEqual([
      { type: "download", remote: remote(A) },
    ]);
    expect(planWardrobeSync([local(A, { hasFile: false })], [], base())).toEqual([]);
  });

  it("handles capes before the skins worn with them", () => {
    const cape = remote(B, { kind: "cape", model: null });
    const skin = remote(A, { cape: B });
    expect(planWardrobeSync([], [skin, cape], base()).map((action) => action.type)).toEqual([
      "download",
      "download",
    ]);
    expect((planWardrobeSync([], [skin, cape], base())[0] as { remote: RemoteWardrobeItem }).remote.kind).toBe(
      "cape",
    );
  });
});

describe("applyWardrobeEdits", () => {
  it("keeps account-bound capes and the launcher's own fields", () => {
    const mojangCape = "c".repeat(40);
    const next = applyWardrobeEdits(
      {
        skins: [{ id: A, hash: A, name: "Old", model: "classic", capeId: mojangCape, remoteId: "mojang-skin", url: "x" }],
        capes: [{ id: mojangCape, hash: mojangCape, alias: "Migrator", remoteId: "mojang-cape", url: "y" }],
      },
      "/skins",
      new Map([[`skin:${A}`, { kind: "skin" as const, hash: A, name: "New", model: "slim" as const, cape: null, updatedAt: 9 }]]),
      new Set(),
    );

    expect(next.skins?.[0]).toMatchObject({ name: "New", model: "slim", capeId: mojangCape, remoteId: "mojang-skin", updatedAt: 9 });
  });

  it("unpins a removed cape from its skins", () => {
    const next = applyWardrobeEdits(
      {
        skins: [{ id: A, hash: A, name: "S", model: "classic", capeId: B, url: "x" }],
        capes: [{ id: B, hash: B, alias: "C", url: "y" }],
      },
      "/skins",
      new Map(),
      new Set([`cape:${B}`]),
    );
    expect(next.capes).toEqual([]);
    expect(next.skins?.[0]).not.toHaveProperty("capeId");
  });
});

describe("syncWardrobe between two launchers", () => {
  let first = "";
  let second = "";

  beforeEach(async () => {
    server.items.clear();
    server.calls.length = 0;
    first = await fs.mkdtemp(path.join(os.tmpdir(), "gl-sync-a-"));
    second = await fs.mkdtemp(path.join(os.tmpdir(), "gl-sync-b-"));
  });

  afterEach(async () => {
    await fs.remove(first).catch(() => {});
    await fs.remove(second).catch(() => {});
  });

  async function addSkin(root: string, data: Buffer, name: string, updatedAt = 100) {
    const hash = sha1(data);
    const file = path.join(root, "skins", `${hash}.png`);
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, data);
    await fs.writeJSON(path.join(root, "skins", "index.json"), {
      skins: [{ id: hash, hash, name, model: "classic", url: pathToFileURL(file).href, updatedAt }],
      capes: [],
    });
    return hash;
  }

  const index = (root: string) => fs.readJSON(path.join(root, "skins", "index.json"));

  it("carries a skin over, then a rename back, then a deletion", async () => {
    const hash = await addSkin(first, png(64, 64, 40), "Knight");

    await expect(syncWardrobe(first, "token", USER)).resolves.toEqual({ ok: true, changed: false });
    await expect(syncWardrobe(second, "token", USER)).resolves.toEqual({ ok: true, changed: true });
    expect((await index(second)).skins).toMatchObject([{ hash, name: "Knight", model: "classic" }]);
    expect(await fs.pathExists(path.join(second, "skins", `${hash}.png`))).toBe(true);

    const manager = new SkinsManager(second, "elyby", "user-2", "Nick", "token");
    await manager.load();
    await manager.renameSkin(hash, "Paladin");
    await syncWardrobe(second, "token", USER);
    await syncWardrobe(first, "token", USER);
    expect((await index(first)).skins[0].name).toBe("Paladin");

    await fs.writeJSON(path.join(first, "skins", "index.json"), { skins: [], capes: [] });
    await syncWardrobe(first, "token", USER);
    expect(server.items.size).toBe(0);
    await syncWardrobe(second, "token", USER);
    expect((await index(second)).skins).toEqual([]);
    expect(await fs.pathExists(path.join(second, "skins", `${hash}.png`))).toBe(false);
  });

  it("refuses bytes that do not match the name they came under", async () => {
    const good = png(64, 64, 70);
    const hash = sha1(good);
    server.items.set(`skin:${hash}`, {
      kind: "skin",
      hash,
      name: "x",
      model: "classic",
      cape: null,
      changedAt: 5,
      data: png(64, 64, 71),
    });

    await expect(syncWardrobe(second, "token", USER)).resolves.toEqual({ ok: true, changed: false });
    expect(await fs.pathExists(path.join(second, "skins", `${hash}.png`))).toBe(false);
  });

  it("keeps each account's last synced state apart", async () => {
    const hash = await addSkin(first, png(64, 64, 90), "Shared");
    await syncWardrobe(first, "token", USER);
    server.items.clear();

    await syncWardrobe(first, "token", "64f000000000000000000002");
    expect(server.items.has(`skin:${hash}`)).toBe(true);
    expect((await index(first)).skins).toHaveLength(1);
  });
});

describe("SkinsManager change times", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-stamps-"));
  });

  afterEach(async () => {
    await fs.remove(root).catch(() => {});
  });

  it("keeps stored times through a load and stamps only real edits", async () => {
    const data = png(64, 64, 120);
    const hash = sha1(data);
    const file = path.join(root, "skins", `${hash}.png`);
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, data);
    await fs.writeJSON(path.join(root, "skins", "index.json"), {
      skins: [
        { id: hash, hash, name: "Old", model: "classic", url: pathToFileURL(file).href, updatedAt: 42 },
      ],
      capes: [],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();
    expect(manager.getData().skins.skins[0].updatedAt).toBe(42);

    await manager.changeModel("classic");
    expect(manager.getData().skins.skins[0].updatedAt).toBe(42);

    await manager.changeModel("slim");
    expect(manager.getData().skins.skins[0].updatedAt).toBeGreaterThan(42);

    await manager.saveSkins();
    const stored = await fs.readJSON(path.join(root, "skins", "index.json"));
    expect(stored.skins[0].updatedAt).toBeGreaterThan(42);
  });

  it("treats skins from before the sync as never edited", async () => {
    const data = png(64, 64, 130);
    const hash = sha1(data);
    const file = path.join(root, "skins", `${hash}.png`);
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, data);
    await fs.writeJSON(path.join(root, "skins", "index.json"), {
      skins: [{ id: hash, hash, name: "Legacy", model: "classic", url: pathToFileURL(file).href }],
      capes: [],
    });

    const manager = new SkinsManager(root, "elyby", "user-1", "Nick", "token");
    await manager.load();
    expect(manager.getData().skins.skins[0].updatedAt).toBe(0);
  });
});
