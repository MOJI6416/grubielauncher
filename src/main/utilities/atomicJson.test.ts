import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonAtomic, writeJsonAtomicSync } from "./atomicJson";

const createdDirs: string[] = [];

async function createTempDir(name: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
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
});
