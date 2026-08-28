import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { createZipArchive, extractZip } from "./archiver";
import { isKeptWorldEntry, listExistingWorldFolders } from "./worldInstall";

let root = "";
let instancePath = "";
let packRoot = "";
let zipPath = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-world-install-"));
  instancePath = path.join(root, "instance");
  packRoot = path.join(root, "pack");
  zipPath = path.join(root, "other.zip");

  await fs.outputFile(
    path.join(instancePath, "saves", "Мой мир", "level.dat"),
    "local-level",
  );
  await fs.outputFile(
    path.join(instancePath, "saves", "Мой мир", "region", "r.0.0.mca"),
    "local-progress",
  );
  await fs.outputFile(path.join(instancePath, "config", "mod.toml"), "old=1");

  await fs.outputFile(
    path.join(packRoot, "saves", "Мой мир", "level.dat"),
    "pack-level",
  );
  await fs.outputFile(
    path.join(packRoot, "saves", "Мой мир", "region", "r.0.0.mca"),
    "pack-progress",
  );
  await fs.outputFile(
    path.join(packRoot, "saves", "Новый мир", "level.dat"),
    "pack-new-level",
  );
  await fs.outputFile(path.join(packRoot, "config", "mod.toml"), "new=1");

  await createZipArchive(
    [path.join(packRoot, "saves"), path.join(packRoot, "config")],
    zipPath,
    packRoot,
  );
});

afterEach(async () => {
  await fs.remove(root);
});

async function read(...segments: string[]) {
  return fs.readFile(path.join(instancePath, ...segments), "utf-8");
}

describe("installing shared extra files", () => {
  it("never overwrites a world the player already has", async () => {
    const keptWorlds = await listExistingWorldFolders(instancePath);
    expect([...keptWorlds]).toEqual(["мой мир"]);

    await extractZip(zipPath, instancePath, undefined, (entryName) =>
      isKeptWorldEntry(entryName, keptWorlds),
    );

    expect(await read("saves", "Мой мир", "level.dat")).toBe("local-level");
    expect(await read("saves", "Мой мир", "region", "r.0.0.mca")).toBe(
      "local-progress",
    );

    expect(await read("saves", "Новый мир", "level.dat")).toBe(
      "pack-new-level",
    );
    expect(await read("config", "mod.toml")).toBe("new=1");
  });

  it("overwrites everything when the guard is not applied", async () => {
    await extractZip(zipPath, instancePath);

    expect(await read("saves", "Мой мир", "region", "r.0.0.mca")).toBe(
      "pack-progress",
    );
  });

  it("ignores folders that are not worlds", async () => {
    await fs.ensureDir(path.join(instancePath, "saves", "Пустышка"));
    const keptWorlds = await listExistingWorldFolders(instancePath);

    expect(keptWorlds.has("пустышка")).toBe(false);
    expect(isKeptWorldEntry("config/mod.toml", keptWorlds)).toBe(false);
    expect(isKeptWorldEntry("saves/Мой мир/level.dat", keptWorlds)).toBe(true);
  });
});
