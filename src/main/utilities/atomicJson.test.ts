import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeJsonAtomic, writeJsonAtomicSync } from "./atomicJson";

const createdDirs: string[] = [];

async function createTempDir(name: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (createdDirs.length) {
    await fs.remove(createdDirs.pop()!).catch(() => {});
  }
});

describe("atomic json writes", () => {
  it("leaves no temporary file behind after a sync write", async () => {
    const dir = await createTempDir("atomic-sync");
    const filePath = path.join(dir, "window-state.json");

    writeJsonAtomicSync(filePath, { width: 1280, height: 720 });

    expect(await fs.readJSON(filePath)).toEqual({ width: 1280, height: 720 });
    expect(await fs.readdir(dir)).toEqual(["window-state.json"]);
  });

  it("removes stale temporary files left by a killed process", async () => {
    const dir = await createTempDir("atomic-sweep");
    const filePath = path.join(dir, "accounts.json");
    const stale = path.join(dir, "window-state.json.tmp-1234-1785027713190");
    const fresh = path.join(dir, "settings.json.tmp-4321-1785027713190");
    const unrelated = path.join(dir, "skin.tmp-abc.png");

    await fs.writeFile(stale, "{}");
    await fs.writeFile(fresh, "{}");
    await fs.writeFile(unrelated, "{}");
    const staleTime = new Date(Date.now() - 60 * 60 * 1000);
    await fs.utimes(stale, staleTime, staleTime);

    await writeJsonAtomic(filePath, { ok: true });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(await fs.pathExists(stale)).toBe(false);
    expect(await fs.pathExists(fresh)).toBe(true);
    expect(await fs.pathExists(unrelated)).toBe(true);
    expect(await fs.readJSON(filePath)).toEqual({ ok: true });
  });

  it("replaces the target by rename instead of deleting it first", async () => {
    const dir = await createTempDir("atomic-rename");
    const filePath = path.join(dir, "accounts.json");
    await fs.writeJSON(filePath, { accounts: ["old"] });

    const move = vi.spyOn(fs, "move");
    const remove = vi.spyOn(fs, "remove");
    const rename = vi.spyOn(fs, "rename");

    await writeJsonAtomic(filePath, { accounts: ["new"] });

    expect(rename).toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalledWith(filePath);
    expect(await fs.readJSON(filePath)).toEqual({ accounts: ["new"] });
    expect(await fs.readdir(dir)).toEqual(["accounts.json"]);
  });

  it("retries a rename locked by another process and keeps the old content until it succeeds", async () => {
    const dir = await createTempDir("atomic-locked");
    const filePath = path.join(dir, "version.json");
    await fs.writeJSON(filePath, { build: 1 });

    const original = fs.rename.bind(fs);
    let attempts = 0;
    vi.spyOn(fs, "rename").mockImplementation((async (
      source: string,
      target: string,
    ) => {
      attempts++;
      if (attempts === 1) {
        const error: NodeJS.ErrnoException = new Error("locked");
        error.code = "EPERM";
        throw error;
      }
      return original(source, target);
    }) as unknown as typeof fs.rename);

    await writeJsonAtomic(filePath, { build: 2 });

    expect(attempts).toBe(2);
    expect(await fs.readJSON(filePath)).toEqual({ build: 2 });
  });

  it("keeps the previous file intact when the rename never succeeds", async () => {
    const dir = await createTempDir("atomic-failed");
    const filePath = path.join(dir, "servers.json");
    await fs.writeJSON(filePath, { keep: true });

    vi.spyOn(fs, "rename").mockImplementation((async () => {
      const error: NodeJS.ErrnoException = new Error("locked");
      error.code = "EBUSY";
      throw error;
    }) as unknown as typeof fs.rename);

    await expect(writeJsonAtomic(filePath, { keep: false })).rejects.toThrow();

    expect(await fs.readJSON(filePath)).toEqual({ keep: true });
    expect(await fs.readdir(dir)).toEqual(["servers.json"]);
  });
});
