import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { checkInstallRoom } from "./installRoom";
import { FREE_SPACE_MARGIN_BYTES } from "./diskSpace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe("checkInstallRoom", () => {
  it("adds the size of folders the install will copy", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-room-"));
    roots.push(root);
    await fs.outputFile(path.join(root, "pack", "overrides", "config", "a.txt"), "x".repeat(1000));

    const room = await checkInstallRoom(
      path.join(root, "versions", "New Instance"),
      500,
      [path.join(root, "pack", "overrides"), path.join(root, "pack", "missing")],
    );

    expect(room.neededBytes).toBe(1500);
    expect(room.drive).toBe(path.parse(root).root);
    expect(room.ok).toBe(
      room.freeBytes === null || room.freeBytes >= 1500 + FREE_SPACE_MARGIN_BYTES,
    );
  });

  it("reports a disk that cannot hold the install", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-room-"));
    roots.push(root);

    const room = await checkInstallRoom(root, Number.MAX_SAFE_INTEGER);

    if (room.freeBytes !== null) expect(room.ok).toBe(false);
  });
});
