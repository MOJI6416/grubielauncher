import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { TRASH_REASONS_FILE, fileStem, moveFilesToTrash } from "./trash";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-trash-reasons-"));
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("fileStem", () => {
  it("ignores versions so an update matches the file it replaced", () => {
    expect(fileStem("sodium-fabric-0.5.3+mc1.20.1.jar")).toBe(
      fileStem("sodium-fabric-0.6.0+mc1.21.1.jar"),
    );
    expect(fileStem("AdLods-1.21.1-9.1.7.0-NeoForge-build.1080.jar.disabled")).toBe(
      fileStem("AdLods-1.21.1-9.1.8.0-NeoForge-build.1102.jar"),
    );
  });

  it("keeps different mods apart", () => {
    expect(fileStem("iris-1.8.0.jar")).not.toBe(fileStem("sodium-1.8.0.jar"));
  });
});

describe("moveFilesToTrash", () => {
  it("remembers why every file went to the trash", async () => {
    const mods = path.join(root, "mods");
    const trash = path.join(root, "trash");
    await fs.ensureDir(mods);
    await fs.writeFile(path.join(mods, "old-1.0.jar"), "a");
    await fs.writeFile(path.join(mods, "gone.jar"), "b");

    await moveFilesToTrash(
      trash,
      [path.join(mods, "old-1.0.jar"), path.join(mods, "gone.jar")],
      (file) => (file.endsWith("old-1.0.jar") ? "updated" : "removed"),
    );

    const reasons = await fs.readJSON(path.join(trash, TRASH_REASONS_FILE));
    const byName = Object.fromEntries(
      Object.entries(reasons).map(([raw, reason]) => [
        raw.replace(/^\d{13}-[0-9a-f]{8}-/, ""),
        reason,
      ]),
    );

    expect(byName).toEqual({ "old-1.0.jar": "updated", "gone.jar": "removed" });
  });

  it("forgets reasons of files that already left the trash", async () => {
    const trash = path.join(root, "trash");
    await fs.ensureDir(trash);
    await fs.writeJSON(path.join(trash, TRASH_REASONS_FILE), {
      "1700000000000-aabbccdd-purged.jar": "removed",
    });
    await fs.writeFile(path.join(root, "fresh.jar"), "c");

    await moveFilesToTrash(trash, [path.join(root, "fresh.jar")], () => "foreign");

    const reasons = await fs.readJSON(path.join(trash, TRASH_REASONS_FILE));
    expect(Object.values(reasons)).toEqual(["foreign"]);
  });
});
