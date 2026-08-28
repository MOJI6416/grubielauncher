import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";

const TMP = path.join(os.tmpdir(), `ls-migration-${process.pid}-${Date.now()}`);

const hoisted = vi.hoisted(() => ({ loadFails: true }));

vi.mock("electron", () => ({
  app: { getPath: () => TMP },
  ipcMain: { on: () => {} },
  BrowserWindow: class {
    public webContents = {
      executeJavaScript: async () => JSON.stringify({ lang: "ru" }),
    };
    async loadFile(): Promise<void> {
      if (hoisted.loadFails) throw new Error("renderer hiccup");
    }
    public destroyed = false;
    destroy(): void {
      this.destroyed = true;
    }
  },
}));

const { prepareLegacyLocalStorageDump } = await import(
  "./localStorageMigration"
);

const donePath = path.join(TMP, "app-origin-localstorage.done");
const pendingPath = path.join(TMP, "app-origin-localstorage.json");

describe("legacy localStorage migration", () => {
  beforeEach(async () => {
    await fs.remove(TMP);
    await fs.ensureDir(TMP);
    hoisted.loadFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(async () => {
    await fs.remove(TMP);
  });

  it("retries after a hiccup instead of throwing the old data away", async () => {
    await prepareLegacyLocalStorageDump();
    expect(await fs.pathExists(donePath)).toBe(false);

    await prepareLegacyLocalStorageDump();
    expect(await fs.pathExists(donePath)).toBe(false);

    hoisted.loadFails = false;
    await prepareLegacyLocalStorageDump();

    expect(await fs.pathExists(donePath)).toBe(false);
    expect(await fs.readJSON(pendingPath)).toEqual({ lang: "ru" });
  });

  it("stops retrying a probe that never works", async () => {
    await prepareLegacyLocalStorageDump();
    await prepareLegacyLocalStorageDump();
    expect(await fs.pathExists(donePath)).toBe(false);

    await prepareLegacyLocalStorageDump();
    expect(await fs.pathExists(donePath)).toBe(true);
  });
});
