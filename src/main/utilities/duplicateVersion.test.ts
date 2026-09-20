import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { pathToFileURL } from "url";
import { INSTANCE_ID_FILE } from "@/shared/instancePrivacy";

const hoisted = vi.hoisted(() => ({ appData: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.appData },
}));

import {
  DUPLICATE_NAME_TAKEN,
  DUPLICATE_SOURCE_MISSING,
  duplicateVersion,
} from "./duplicateVersion";

let root = "";
let versionsPath = "";

function conf(overrides: Record<string, unknown> = {}) {
  return {
    name: "Pack",
    version: { id: "1.21.1", type: "release", url: "", serverManager: false },
    loader: { name: "fabric", version: { id: "0.16.0" }, mods: [] },
    lastUpdate: new Date().toISOString(),
    ...overrides,
  };
}

async function writeSource(
  name: string,
  overrides: Record<string, unknown> = {},
) {
  const sourcePath = path.join(versionsPath, name);
  await fs.ensureDir(sourcePath);
  await fs.writeJSON(path.join(sourcePath, "version.json"), conf(overrides));
  return sourcePath;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-duplicate-"));
  hoisted.appData = root;
  versionsPath = path.join(root, ".grubielauncher", "minecraft", "versions");
  await fs.ensureDir(versionsPath);
});

afterEach(async () => {
  await fs.remove(root).catch(() => undefined);
});

describe("duplicateVersion", () => {
  it("copies the instance under the new name", async () => {
    const sourcePath = await writeSource("Pack");
    await fs.outputFile(path.join(sourcePath, "mods", "jei.jar"), "jar");
    await fs.outputFile(
      path.join(sourcePath, "saves", "World", "level.dat"),
      "nbt",
    );

    const duplicated = await duplicateVersion("Pack", "Pack copy");

    expect(duplicated.name).toBe("Pack copy");
    const copyPath = path.join(versionsPath, "Pack copy");
    expect(await fs.pathExists(path.join(copyPath, "mods", "jei.jar"))).toBe(
      true,
    );
    expect(
      await fs.pathExists(path.join(copyPath, "saves", "World", "level.dat")),
    ).toBe(true);
    expect(await fs.pathExists(path.join(sourcePath, "mods", "jei.jar"))).toBe(
      true,
    );
  });

  it("detaches the copy from the publication", async () => {
    await writeSource("Pack", {
      shareCode: "6d012725072387148fdf0f7a",
      downloadedVersion: true,
      owner: "discord_Steve",
      ownerId: "69e792de03b7ca3611a8ca0a",
      lastLaunch: new Date().toISOString(),
    });

    const duplicated = await duplicateVersion("Pack", "Pack copy");

    expect(duplicated.shareCode).toBeUndefined();
    expect(duplicated.downloadedVersion).toBe(false);
    expect(duplicated.owner).toBeUndefined();
    expect(duplicated.ownerId).toBeUndefined();
    expect(duplicated.lastLaunch).toBeUndefined();
  });

  it("gives the copy its own identity", async () => {
    const sourcePath = await writeSource("Pack");
    await fs.outputFile(path.join(sourcePath, INSTANCE_ID_FILE), "id-1");

    await duplicateVersion("Pack", "Pack copy");

    expect(
      await fs.pathExists(
        path.join(versionsPath, "Pack copy", INSTANCE_ID_FILE),
      ),
    ).toBe(false);
    expect(await fs.pathExists(path.join(sourcePath, INSTANCE_ID_FILE))).toBe(
      true,
    );
  });

  it("leaves out logs, caches and the rollback of the source install", async () => {
    const sourcePath = await writeSource("Pack");
    await fs.outputFile(path.join(sourcePath, "logs", "latest.log"), "log");
    await fs.outputFile(path.join(sourcePath, "natives", "lwjgl.dll"), "bin");
    await fs.outputFile(
      path.join(sourcePath, "downloads", "cached.jar"),
      "jar",
    );
    await fs.outputFile(
      path.join(sourcePath, "storage", "loader-rollback", "old.json"),
      "{}",
    );
    await fs.outputFile(
      path.join(sourcePath, "storage", "server-overrides", "keep.txt"),
      "keep",
    );

    await duplicateVersion("Pack", "Pack copy");

    const copyPath = path.join(versionsPath, "Pack copy");
    expect(await fs.pathExists(path.join(copyPath, "logs"))).toBe(false);
    expect(await fs.pathExists(path.join(copyPath, "natives"))).toBe(false);
    expect(await fs.pathExists(path.join(copyPath, "downloads"))).toBe(false);
    expect(
      await fs.pathExists(path.join(copyPath, "storage", "loader-rollback")),
    ).toBe(false);
    expect(
      await fs.pathExists(
        path.join(copyPath, "storage", "server-overrides", "keep.txt"),
      ),
    ).toBe(true);
  });

  it("points the logo at the copy, not at the source folder", async () => {
    const sourcePath = await writeSource("Pack");
    await fs.outputFile(path.join(sourcePath, "logo.png"), "png");
    await fs.writeJSON(
      path.join(sourcePath, "version.json"),
      conf({ image: pathToFileURL(path.join(sourcePath, "logo.png")).href }),
    );

    const duplicated = await duplicateVersion("Pack", "Pack copy");

    expect(duplicated.image).toBe(
      pathToFileURL(path.join(versionsPath, "Pack copy", "logo.png")).href,
    );
  });

  it("refuses a name that is already taken and keeps what is there", async () => {
    await writeSource("Pack");
    const takenPath = path.join(versionsPath, "Pack copy");
    await fs.outputFile(path.join(takenPath, "marker.txt"), "mine");

    await expect(duplicateVersion("Pack", "Pack copy")).rejects.toThrow(
      DUPLICATE_NAME_TAKEN,
    );
    expect(await fs.readFile(path.join(takenPath, "marker.txt"), "utf-8")).toBe(
      "mine",
    );
  });

  it("refuses to copy an instance onto itself", async () => {
    await writeSource("Pack");

    await expect(duplicateVersion("Pack", "Pack")).rejects.toThrow(
      DUPLICATE_NAME_TAKEN,
    );
  });

  it("refuses a source that is not an instance", async () => {
    await fs.ensureDir(path.join(versionsPath, "Empty"));

    await expect(duplicateVersion("Empty", "Empty copy")).rejects.toThrow(
      DUPLICATE_SOURCE_MISSING,
    );
  });

  it("refuses a name that escapes the versions folder", async () => {
    await writeSource("Pack");

    await expect(
      duplicateVersion("Pack", path.join("..", "escape")),
    ).rejects.toThrow();
    expect(await fs.pathExists(path.join(versionsPath, "..", "escape"))).toBe(
      false,
    );
  });
});
