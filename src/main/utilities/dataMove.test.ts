import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";

const { TMP } = vi.hoisted(() => {
  const nodeOs = require("os");
  const nodePath = require("path");
  return {
    TMP: nodePath.join(
      nodeOs.tmpdir(),
      `grubie-datamove-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) =>
      name === "userData" ? `${TMP}/userData` : `${TMP}/appData`,
  },
}));

import {
  DATA_SUBFOLDER,
  DataMoveError,
  isAbortError,
  looksLikeDataRoot,
  MOVE_MARKER,
  MOVED_MARKER,
  moveDataRoot,
  planDataTarget,
  removeOldDataRoot,
} from "./dataMove";
import {
  getDataRoot,
  getDefaultDataRoot,
  readDataLocation,
  sanitizeDataLocation,
  writeDataLocation,
} from "./dataRoot";

let sandbox: string;

async function makeDataRoot(dir: string): Promise<void> {
  await fs.outputJson(path.join(dir, "settings.json"), { lang: "ru" });
  await fs.outputFile(
    path.join(dir, "minecraft", "versions", "Survival", "version.json"),
    "{}",
  );
  await fs.outputFile(
    path.join(dir, "java", "bin", "java.exe"),
    "x".repeat(2048),
  );
  await fs.ensureDir(path.join(dir, "minecraft", "saves-empty"));
}

async function listTree(root: string): Promise<string[]> {
  const result: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      result.push(path.relative(root, full) + (entry.isDirectory() ? "/" : ""));
      if (entry.isDirectory()) await walk(full);
    }
  };
  await walk(root);
  return result.sort();
}

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-datamove-"));
});

afterEach(async () => {
  await fs.remove(sandbox);
  await fs.remove(TMP);
});

describe("data root location", () => {
  it("falls back to the default root without a location file", () => {
    expect(getDataRoot()).toBe(path.join(`${TMP}/appData`, ".grubielauncher"));
  });

  it("reads a custom root and forgets it when it points to the default", () => {
    const custom = path.join(sandbox, "Custom");
    writeDataLocation({ root: custom });
    expect(getDataRoot()).toBe(custom);

    writeDataLocation({ root: getDefaultDataRoot() });
    expect(readDataLocation()).toEqual({});
    expect(getDataRoot()).toBe(getDefaultDataRoot());
  });

  it("drops relative and malformed entries", () => {
    expect(
      sanitizeDataLocation({
        root: "relative/path",
        move: { from: "/a" },
        cleanup: ["x", 5, path.resolve("/old")],
      }),
    ).toEqual({ cleanup: [path.resolve("/old")] });
  });
});

describe("planDataTarget", () => {
  const base = { protectedRoots: [] as string[], cleanup: [] as string[] };

  it("uses an empty folder as is and a busy folder through a subfolder", async () => {
    const current = path.join(sandbox, "current");
    await makeDataRoot(current);
    const empty = path.join(sandbox, "empty");
    await fs.ensureDir(empty);
    const busy = path.join(sandbox, "busy");
    await fs.outputFile(path.join(busy, "notes.txt"), "hi");

    const first = await planDataTarget({ ...base, chosen: empty, current });
    expect(first).toMatchObject({ kind: "move", target: empty });

    const second = await planDataTarget({ ...base, chosen: busy, current });
    expect(second).toMatchObject({
      kind: "move",
      target: path.join(busy, DATA_SUBFOLDER),
    });
    expect(second.kind === "move" && second.bytes).toBeGreaterThan(2048);
  });

  it("adopts a folder that already holds launcher data, even one level down", async () => {
    const current = path.join(sandbox, "current");
    await makeDataRoot(current);
    const drive = path.join(sandbox, "drive");
    await makeDataRoot(path.join(drive, DATA_SUBFOLDER));

    await expect(
      planDataTarget({ ...base, chosen: drive, current }),
    ).resolves.toEqual({
      kind: "adopt",
      target: path.join(drive, DATA_SUBFOLDER),
    });
  });

  it("refuses the current root, nested folders, protected and pending ones", async () => {
    const current = path.join(sandbox, "current");
    await makeDataRoot(current);

    await expect(
      planDataTarget({ ...base, chosen: current, current }),
    ).resolves.toMatchObject({ kind: "error", problem: "same" });

    await expect(
      planDataTarget({
        ...base,
        chosen: path.join(current, "minecraft", "new"),
        current,
      }),
    ).resolves.toMatchObject({ kind: "error", problem: "nested" });

    const programs = path.join(sandbox, "Programs");
    await expect(
      planDataTarget({
        ...base,
        chosen: path.join(programs, "games"),
        current,
        protectedRoots: [programs],
      }),
    ).resolves.toMatchObject({ kind: "error", problem: "protected" });

    const old = path.join(sandbox, "old");
    await makeDataRoot(old);
    await expect(
      planDataTarget({ ...base, chosen: old, current, cleanup: [old] }),
    ).resolves.toMatchObject({ kind: "error", problem: "cleanupPending" });
  });

  it("treats a half-copied or half-deleted folder as having no data", async () => {
    const current = path.join(sandbox, "current");
    await makeDataRoot(current);
    const partial = path.join(sandbox, "partial");
    await makeDataRoot(partial);
    await fs.writeFile(path.join(partial, MOVE_MARKER), "{}");

    expect(await looksLikeDataRoot(partial)).toBe(false);
    await expect(
      planDataTarget({ ...base, chosen: partial, current }),
    ).resolves.toMatchObject({ kind: "move", target: partial });
    await expect(
      planDataTarget({ ...base, chosen: partial, current, adoptOnly: true }),
    ).resolves.toMatchObject({ kind: "error", problem: "noData" });
  });

  it("uses the default path exactly and never a subfolder of it", async () => {
    const current = path.join(sandbox, "current");
    await makeDataRoot(current);
    const fallback = path.join(sandbox, "default");
    await fs.outputFile(path.join(fallback, "junk.txt"), "x");

    await expect(
      planDataTarget({ ...base, chosen: fallback, current, exact: true }),
    ).resolves.toMatchObject({ kind: "error", problem: "notEmpty" });
  });
});

describe("moveDataRoot", () => {
  it("copies over a leftover target, keeps timestamps and leaves the marker", async () => {
    const from = path.join(sandbox, "from");
    await makeDataRoot(from);
    const stamp = new Date("2024-01-02T03:04:05Z");
    await fs.utimes(path.join(from, "settings.json"), stamp, stamp);
    const to = path.join(sandbox, "to");
    await fs.outputFile(path.join(to, MOVE_MARKER), "{}");
    await fs.outputFile(path.join(to, "stale.bin"), "old");

    const progress: number[] = [];
    await expect(
      moveDataRoot(from, to, {
        onProgress: (value) => progress.push(value.copiedBytes),
      }),
    ).resolves.toBe("copied");

    expect(await fs.pathExists(path.join(to, MOVE_MARKER))).toBe(true);
    await fs.remove(path.join(to, MOVE_MARKER));
    expect(await listTree(to)).toEqual(await listTree(from));
    expect(progress.at(-1)).toBeGreaterThan(2048);

    const copied = await fs.stat(path.join(to, "settings.json"));
    expect(copied.mtime.getTime()).toBe(stamp.getTime());
  });

  it("renames the folder when both paths share a volume", async () => {
    const from = path.join(sandbox, "from");
    await makeDataRoot(from);
    const to = path.join(sandbox, "nested", "to");

    await expect(moveDataRoot(from, to)).resolves.toBe("renamed");
    expect(await fs.pathExists(from)).toBe(false);
    expect(await looksLikeDataRoot(to)).toBe(true);
  });

  it("refuses a target that already holds files", async () => {
    const from = path.join(sandbox, "from");
    await makeDataRoot(from);
    const to = path.join(sandbox, "to");
    await fs.outputFile(path.join(to, "other.txt"), "x");

    await expect(moveDataRoot(from, to)).rejects.toMatchObject({
      reason: "notEmpty",
    });
  });

  it("cleans a cancelled copy and leaves the source untouched", async () => {
    const from = path.join(sandbox, "from");
    await makeDataRoot(from);
    for (let index = 0; index < 40; index += 1) {
      await fs.outputFile(
        path.join(from, "assets", `${index}.bin`),
        "y".repeat(512),
      );
    }
    const to = path.join(sandbox, "to");
    await fs.outputFile(path.join(to, MOVE_MARKER), "{}");

    const controller = new AbortController();
    const error = await moveDataRoot(from, to, {
      signal: controller.signal,
      onProgress: (value) => {
        if (value.phase === "copy" && value.copiedBytes > 0) controller.abort();
      },
    }).catch((reason) => reason);

    expect(isAbortError(error)).toBe(true);
    expect(await fs.readdir(to)).toEqual([]);
    expect(await looksLikeDataRoot(from)).toBe(true);
  });

  it("reports a missing source", async () => {
    await expect(
      moveDataRoot(path.join(sandbox, "nope"), path.join(sandbox, "to")),
    ).rejects.toBeInstanceOf(DataMoveError);
  });
});

describe("removeOldDataRoot", () => {
  it("removes an old data root completely", async () => {
    const old = path.join(sandbox, "old");
    await makeDataRoot(old);

    await expect(
      removeOldDataRoot(old, path.join(sandbox, "new")),
    ).resolves.toBe("removed");
    expect(await fs.pathExists(old)).toBe(false);
  });

  it("keeps folders that are not launcher data or overlap the current root", async () => {
    const stranger = path.join(sandbox, "stranger");
    await fs.outputFile(path.join(stranger, "photo.jpg"), "x");
    await expect(
      removeOldDataRoot(stranger, path.join(sandbox, "new")),
    ).resolves.toBe("kept");
    expect(await fs.pathExists(path.join(stranger, "photo.jpg"))).toBe(true);

    const current = path.join(sandbox, "current");
    await makeDataRoot(current);
    await expect(removeOldDataRoot(current, current)).resolves.toBe("kept");
    expect(await looksLikeDataRoot(current)).toBe(true);
  });

  it("finishes a half-deleted folder recognised by its marker", async () => {
    const old = path.join(sandbox, "old");
    await fs.outputFile(path.join(old, "leftover", "file.bin"), "x");
    await fs.writeFile(path.join(old, MOVED_MARKER), "{}");

    await expect(
      removeOldDataRoot(old, path.join(sandbox, "new")),
    ).resolves.toBe("removed");
    expect(await fs.pathExists(old)).toBe(false);
  });
});
