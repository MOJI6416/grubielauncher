import { describe, expect, it } from "vitest";
import {
  BackupStorage,
  MAX_SNAPSHOTS,
  backupSlug,
  captureSnapshot,
  emptyBackupIndex,
  loadBackupIndex,
  nextSnapshot,
  parseBackupIndex,
  pruneSnapshots,
  readSnapshot,
} from "./backups";

function memoryStorage(): BackupStorage & { files: Map<string, string> } {
  const files = new Map<string, string>();

  return {
    files,
    join: (...parts: string[]) => parts.join("/"),
    ensure: async () => true,
    readFile: async (filePath: string) => {
      const value = files.get(filePath);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
    writeFile: async (filePath: string, data: string) => {
      files.set(filePath, data);
      return true;
    },
    pathExists: async (target: string) => files.has(target),
    rimraf: async (target: string) => files.delete(target),
  };
}

describe("config backups", () => {
  it("builds a readable and collision-free slug", () => {
    expect(backupSlug("fml.toml")).not.toBe(backupSlug("sub/fml.toml"));
    expect(backupSlug("sub/fml.toml")).toContain("sub-fml-toml");
    expect(backupSlug("../../etc/passwd")).not.toContain("..");
    expect(backupSlug("../../etc/passwd")).not.toContain("/");
  });

  it("marks the very first capture as the baseline", () => {
    const first = nextSnapshot([], 10, 3);
    expect(first.kind).toBe("baseline");
    expect(nextSnapshot([first], 20, 3).kind).toBe("snapshot");
  });

  it("never reuses an id inside the same millisecond", () => {
    const first = nextSnapshot([], 10, 1);
    expect(nextSnapshot([first], 10, 1).id).not.toBe(first.id);
  });

  it("keeps the baseline and the newest snapshots", () => {
    const snapshots = [
      { id: "b", time: 1, size: 1, kind: "baseline" as const },
      ...Array.from({ length: MAX_SNAPSHOTS + 3 }, (_, index) => ({
        id: `s${index}`,
        time: 100 + index,
        size: 1,
        kind: "snapshot" as const,
      })),
    ];

    const { keep, drop } = pruneSnapshots(snapshots);

    expect(keep).toHaveLength(MAX_SNAPSHOTS + 1);
    expect(keep.some((entry) => entry.kind === "baseline")).toBe(true);
    expect(drop.map((entry) => entry.id)).toEqual(["s2", "s1", "s0"]);
  });

  it("ignores a damaged index instead of throwing", () => {
    expect(parseBackupIndex(null)).toEqual(emptyBackupIndex());
    expect(parseBackupIndex({ files: { a: "nope" } })).toEqual(
      emptyBackupIndex(),
    );
    expect(
      parseBackupIndex({ files: { a: [{ id: 1 }, { id: "x", time: 2, size: 3, kind: "snapshot" }] } }),
    ).toEqual({
      version: 1,
      files: { a: [{ id: "x", time: 2, size: 3, kind: "snapshot" }] },
    });
  });

  it("writes a snapshot and reads it back", async () => {
    const storage = memoryStorage();
    const root = "root";

    let index = await captureSnapshot(
      storage,
      root,
      emptyBackupIndex(),
      "fml.toml",
      "first",
      1000,
    );
    index = await captureSnapshot(storage, root, index, "fml.toml", "second", 2000);

    const snapshots = index.files["fml.toml"];
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].kind).toBe("snapshot");
    expect(snapshots[1].kind).toBe("baseline");

    expect(await readSnapshot(storage, root, "fml.toml", snapshots[1])).toBe(
      "first",
    );
    expect(await readSnapshot(storage, root, "fml.toml", snapshots[0])).toBe(
      "second",
    );

    expect(await loadBackupIndex(storage, root)).toEqual(index);
  });

  it("deletes files that fell out of retention", async () => {
    const storage = memoryStorage();
    let index = emptyBackupIndex();

    for (let step = 0; step < MAX_SNAPSHOTS + 4; step += 1) {
      index = await captureSnapshot(
        storage,
        "root",
        index,
        "a.cfg",
        `v${step}`,
        1000 + step,
      );
    }

    expect(index.files["a.cfg"]).toHaveLength(MAX_SNAPSHOTS + 1);
    expect(storage.files.size).toBe(MAX_SNAPSHOTS + 2);

    const baseline = index.files["a.cfg"].find(
      (entry) => entry.kind === "baseline",
    )!;
    expect(await readSnapshot(storage, "root", "a.cfg", baseline)).toBe("v0");
  });

  it("refuses to record a snapshot the storage did not write", async () => {
    const storage = memoryStorage();
    storage.writeFile = async () => false;

    await expect(
      captureSnapshot(storage, "root", emptyBackupIndex(), "a.cfg", "v", 1),
    ).rejects.toThrow();
    expect(storage.files.size).toBe(0);
  });

  it("refuses to record a snapshot when the index write fails", async () => {
    const storage = memoryStorage();
    const write = storage.writeFile;
    storage.writeFile = async (filePath, data, encoding) =>
      filePath.endsWith("index.json") ? false : write(filePath, data, encoding);

    await expect(
      captureSnapshot(storage, "root", emptyBackupIndex(), "a.cfg", "v", 1),
    ).rejects.toThrow();
  });

  it("reports an unreadable snapshot instead of returning empty text", async () => {
    const storage = memoryStorage();
    const index = await captureSnapshot(
      storage,
      "root",
      emptyBackupIndex(),
      "a.cfg",
      "value",
      1,
    );
    const snapshot = index.files["a.cfg"][0];

    storage.readFile = async () => "";
    expect(await readSnapshot(storage, "root", "a.cfg", snapshot)).toBeNull();
  });

  it("still restores a snapshot of a genuinely empty file", async () => {
    const storage = memoryStorage();
    const index = await captureSnapshot(
      storage,
      "root",
      emptyBackupIndex(),
      "a.cfg",
      "",
      1,
    );

    expect(
      await readSnapshot(storage, "root", "a.cfg", index.files["a.cfg"][0]),
    ).toBe("");
  });

  it("returns null for a snapshot whose file vanished", async () => {
    const storage = memoryStorage();
    const index = await captureSnapshot(
      storage,
      "root",
      emptyBackupIndex(),
      "a.cfg",
      "v",
      1,
    );

    storage.files.clear();
    expect(
      await readSnapshot(storage, "root", "a.cfg", index.files["a.cfg"][0]),
    ).toBeNull();
  });
});
