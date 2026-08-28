import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "path";

const hoisted = vi.hoisted(() => {
  const root = process.env.TEMP || process.env.TMPDIR || "/tmp";
  return { base: `${root}/grubie-worlds-count-${process.pid}-${Date.now()}` };
});

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.base },
  shell: { trashItem: async () => undefined },
}));

import { countWorlds, listWorldFolders } from "./worlds";

const versionPath = path.join(hoisted.base, "versions", "Pack");
const savesPath = path.join(versionPath, "saves");

beforeAll(async () => {
  await fs.ensureDir(savesPath);

  await fs.outputFile(path.join(savesPath, "World 1", "level.dat"), "x");
  await fs.outputFile(path.join(savesPath, "World 2", "level.dat"), "x");

  await fs.ensureDir(path.join(savesPath, "Обрывок мира"));
  await fs.outputFile(path.join(savesPath, "Обрывок мира", "session.lock"), "x");

  await fs.outputFile(
    path.join(savesPath, ".grubie-restore", "World 1-1", "level.dat"),
    "x",
  );

  await fs.outputFile(path.join(savesPath, "loose.zip"), "x");
});

afterAll(async () => {
  await fs.remove(hoisted.base).catch(() => undefined);
});

describe("countWorlds", () => {
  it("counts only folders that actually hold a world", async () => {
    expect(await listWorldFolders(versionPath)).toEqual(["World 1", "World 2"]);
    expect(await countWorlds(versionPath)).toBe(2);
  });

  it("returns zero when there is no saves folder at all", async () => {
    expect(await countWorlds(path.join(hoisted.base, "versions", "Nope"))).toBe(
      0,
    );
  });
});
