import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "fs-extra";
import path from "path";
import { execFileSync } from "child_process";

const hoisted = vi.hoisted(() => {
  const root = process.env.TEMP || process.env.TMPDIR || "/tmp";
  return {
    base: `${root}/grubie-world-backups-${process.pid}-${Date.now()}`,
    trashed: [] as string[],
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.base },
  shell: {
    trashItem: (target: string) => {
      hoisted.trashed.push(target);
      return fs.remove(target);
    },
  },
}));

import {
  cleanupOrphanBackups,
  countWorldBackups,
  createWorldBackup,
  deletePreservedCopy,
  deleteWorldBackup,
  getOrphanBackupsStats,
  getVersionPathFromWorldPath,
  getWorldBackupList,
  isValidBackupId,
  normalizeBackupEntry,
  pickArchiveRoot,
  reassignPreservedCopies,
  reassignWorldBackups,
  recoverPendingRestore,
  restoreWorldBackup,
  runAutoBackupForVersion,
  selectPrunableBackups,
  shouldAutoBackup,
} from "./worldBackups";
import { gameProcesses } from "./runtime";
import { INSTANCE_ID_FILE } from "@/shared/instancePrivacy";
import { IWorldBackup, normalizeWorldBackupKeep } from "@/types/WorldBackup";

const VERSION_NAME = "TestPack";
const WORLD_FOLDER = "World1";
const SAMPLE_ID = "2f1c9e1a-0b3d-4c5e-8a7b-6d5e4f3a2b1c";

const launcherPath = path.join(hoisted.base, ".grubielauncher");
const backupsDir = path.join(launcherPath, "backups");
const versionsPath = path.join(launcherPath, "minecraft", "versions");
const versionPath = path.join(versionsPath, VERSION_NAME);
const savesPath = path.join(versionPath, "saves");
const worldPath = path.join(savesPath, WORLD_FOLDER);

function makeBackup(overrides: Partial<IWorldBackup>): IWorldBackup {
  return {
    id: SAMPLE_ID,
    worldName: "World",
    worldFolder: WORLD_FOLDER,
    versionName: VERSION_NAME,
    createdAt: 1,
    size: 1,
    trigger: "auto",
    ...overrides,
  };
}

async function seedWorld(marker: string, folder = WORLD_FOLDER): Promise<void> {
  const target = path.join(savesPath, folder);

  await fs.remove(target);
  await fs.ensureDir(path.join(target, "region"));
  await fs.writeFile(path.join(target, "level.dat"), `level-${marker}`);
  await fs.writeFile(path.join(target, "region", "r.0.0.mca"), marker);
  await fs.writeFile(path.join(target, "session.lock"), "locked");
}

async function stampInstanceId(
  target = versionPath,
  id = "11111111-2222-4333-8444-555555555555",
): Promise<string> {
  await fs.writeFile(path.join(target, INSTANCE_ID_FILE), id, "utf-8");
  return id;
}

async function listBackupZips(): Promise<string[]> {
  const entries = await fs.readdir(backupsDir).catch(() => [] as string[]);
  return entries.filter((entry) => entry.endsWith(".zip"));
}

async function readMarker(folder = WORLD_FOLDER): Promise<string> {
  return await fs.readFile(
    path.join(savesPath, folder, "region", "r.0.0.mca"),
    "utf-8",
  );
}

function markVersionRunning(): void {
  gameProcesses.set(`${VERSION_NAME}-0`, {
    process: { exitCode: null } as never,
    versionName: VERSION_NAME,
    instance: 0,
    versionPath,
    serverPort: null,
    accessToken: "",
  });
}

beforeAll(async () => {
  await fs.ensureDir(hoisted.base);
});

afterAll(async () => {
  await fs.remove(hoisted.base).catch(() => {});
});

beforeEach(async () => {
  gameProcesses.clear();
  hoisted.trashed.length = 0;
  await fs.remove(backupsDir);
  await fs.remove(savesPath);
  await fs.ensureDir(versionPath);
  await fs.remove(path.join(versionPath, INSTANCE_ID_FILE));
});

describe("normalizeWorldBackupKeep", () => {
  it("clamps to the supported range", () => {
    expect(normalizeWorldBackupKeep(0)).toBe(1);
    expect(normalizeWorldBackupKeep(999)).toBe(20);
    expect(normalizeWorldBackupKeep(7)).toBe(7);
  });

  it("falls back to the default for garbage", () => {
    expect(normalizeWorldBackupKeep("abc")).toBe(5);
    expect(normalizeWorldBackupKeep(undefined)).toBe(5);
  });
});

describe("isValidBackupId", () => {
  it("accepts uuids and rejects anything else", () => {
    expect(isValidBackupId(SAMPLE_ID)).toBe(true);
    expect(isValidBackupId("../../evil")).toBe(false);
    expect(isValidBackupId("-".repeat(36))).toBe(false);
    expect(isValidBackupId("")).toBe(false);
    expect(isValidBackupId(42)).toBe(false);
  });
});

describe("normalizeBackupEntry", () => {
  it("drops entries with an unusable id", () => {
    expect(normalizeBackupEntry({ ...makeBackup({}), id: "../x" })).toBeNull();
    expect(normalizeBackupEntry(null)).toBeNull();
  });

  it("repairs missing optional fields", () => {
    expect(
      normalizeBackupEntry({
        id: SAMPLE_ID,
        worldFolder: "W",
        versionName: "V",
        createdAt: "nope",
        size: -5,
        trigger: "weird",
      }),
    ).toEqual({
      id: SAMPLE_ID,
      worldName: "W",
      worldFolder: "W",
      versionName: "V",
      createdAt: 0,
      size: 0,
      trigger: "manual",
    });
  });
});

describe("selectPrunableBackups", () => {
  it("never prunes manual backups", () => {
    const backups = [
      makeBackup({ id: "a", trigger: "manual", createdAt: 10 }),
      makeBackup({ id: "b", trigger: "manual", createdAt: 9 }),
      makeBackup({ id: "c", trigger: "manual", createdAt: 8 }),
    ];

    expect(selectPrunableBackups(backups, 1)).toEqual([]);
  });

  it("keeps the newest automatic backups only", () => {
    const backups = [
      makeBackup({ id: "old", trigger: "auto", createdAt: 1 }),
      makeBackup({ id: "mid", trigger: "auto", createdAt: 2 }),
      makeBackup({ id: "new", trigger: "auto", createdAt: 3 }),
    ];

    expect(selectPrunableBackups(backups, 2).map((b) => b.id)).toEqual(["old"]);
  });

  it("keeps both ends of the safety chain and drops the middle", () => {
    const backups = [
      makeBackup({ id: "s1", trigger: "preRestore", createdAt: 1 }),
      makeBackup({ id: "s2", trigger: "preRestore", createdAt: 2 }),
      makeBackup({ id: "s3", trigger: "preRestore", createdAt: 3 }),
      makeBackup({ id: "s4", trigger: "preRestore", createdAt: 4 }),
      makeBackup({ id: "s5", trigger: "preRestore", createdAt: 5 }),
    ];

    const pruned = selectPrunableBackups(backups, 5).map((entry) => entry.id);

    expect(pruned).not.toContain("s5");
    expect(pruned).not.toContain("s1");
    expect(backups.length - pruned.length).toBe(3);
  });

  it("does not let safety backups evict automatic ones", () => {
    const backups = [
      makeBackup({ id: "auto1", trigger: "auto", createdAt: 1 }),
      makeBackup({ id: "auto2", trigger: "auto", createdAt: 2 }),
      makeBackup({ id: "safety", trigger: "preRestore", createdAt: 3 }),
    ];

    expect(selectPrunableBackups(backups, 2)).toEqual([]);
  });

  it("honors protected ids", () => {
    const backups = [
      makeBackup({ id: "old", trigger: "auto", createdAt: 1 }),
      makeBackup({ id: "new", trigger: "auto", createdAt: 2 }),
    ];

    expect(selectPrunableBackups(backups, 1, ["old"])).toEqual([]);
  });
});

describe("shouldAutoBackup", () => {
  it("skips when nothing changed since the newest backup", () => {
    expect(shouldAutoBackup(100, [makeBackup({ createdAt: 200 })])).toBe(false);
  });

  it("runs when the world changed after the newest backup", () => {
    expect(shouldAutoBackup(300, [makeBackup({ createdAt: 200 })])).toBe(true);
  });

  it("runs when there is no backup yet", () => {
    expect(shouldAutoBackup(300, [])).toBe(true);
  });

  it("skips untouched worlds only while they have no backups yet", () => {
    expect(shouldAutoBackup(100, [], 200)).toBe(false);
    expect(shouldAutoBackup(300, [], 200)).toBe(true);
    expect(shouldAutoBackup(100, [makeBackup({ createdAt: 50 })], 200)).toBe(
      true,
    );
  });

  it("ignores an unusable mtime", () => {
    expect(shouldAutoBackup(0, [])).toBe(false);
    expect(shouldAutoBackup(Number.NaN, [])).toBe(false);
  });
});

describe("pickArchiveRoot", () => {
  it("uses the archive root when level.dat sits there", () => {
    expect(pickArchiveRoot(true, ["region"])).toBe("");
  });

  it("uses the only top level folder", () => {
    expect(pickArchiveRoot(false, ["World1"])).toBe("World1");
  });

  it("refuses ambiguous archives", () => {
    expect(pickArchiveRoot(false, ["a", "b"])).toBeNull();
    expect(pickArchiveRoot(false, [])).toBeNull();
  });
});

describe("getVersionPathFromWorldPath", () => {
  it("climbs out of saves", () => {
    expect(getVersionPathFromWorldPath(worldPath)).toBe(versionPath);
  });
});

describe("world backup round trip", () => {
  it("creates, lists, restores and deletes a backup", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.backup.versionName).toBe(VERSION_NAME);
    expect(created.backup.worldFolder).toBe(WORLD_FOLDER);
    expect(created.backup.size).toBeGreaterThan(0);

    const listed = await getWorldBackupList(worldPath);
    expect(listed.backups).toHaveLength(1);
    expect(listed.skipReason).toBeNull();

    expect((await countWorldBackups(versionPath))[WORLD_FOLDER]).toBe(1);
    expect(await listBackupZips()).toHaveLength(1);

    await fs.writeFile(
      path.join(worldPath, "region", "r.0.0.mca"),
      "corrupted",
    );

    const restored = await restoreWorldBackup(created.backup.id, worldPath, 5);
    expect(restored.ok).toBe(true);
    expect(await readMarker()).toBe("original");

    const deleted = await deleteWorldBackup(created.backup.id);
    expect(deleted.ok).toBe(true);

    const remaining = await getWorldBackupList(worldPath);
    expect(remaining.backups.map((entry) => entry.id)).not.toContain(
      created.backup.id,
    );
    expect(remaining.backups).toHaveLength(1);
    expect(remaining.backups[0].trigger).toBe("preRestore");
  });

  it("restores an older backup without destroying it", async () => {
    await seedWorld("state-a");
    const first = await createWorldBackup(worldPath, "auto", 2);

    await fs.writeFile(path.join(worldPath, "level.dat"), "level-b");
    await fs.writeFile(path.join(worldPath, "region", "r.0.0.mca"), "state-b");
    const second = await createWorldBackup(worldPath, "auto", 2);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    await fs.writeFile(path.join(worldPath, "region", "r.0.0.mca"), "state-c");

    const restored = await restoreWorldBackup(first.backup.id, worldPath, 2);
    expect(restored.ok).toBe(true);
    expect(await readMarker()).toBe("state-a");

    const listed = await getWorldBackupList(worldPath);
    expect(listed.backups.map((entry) => entry.id)).toContain(first.backup.id);
  });

  it("refuses a backup that belongs to another world", async () => {
    await seedWorld("first", WORLD_FOLDER);
    await seedWorld("second", "World2");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const otherWorldPath = path.join(savesPath, "World2");
    const restored = await restoreWorldBackup(
      created.backup.id,
      otherWorldPath,
      5,
    );

    expect(restored).toEqual({ ok: false, error: "backupMissing" });
    expect(await readMarker("World2")).toBe("second");
  });

  it("excludes session.lock from the archive", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await fs.remove(worldPath);
    expect((await restoreWorldBackup(created.backup.id, worldPath, 5)).ok).toBe(
      true,
    );

    expect(await fs.pathExists(path.join(worldPath, "session.lock"))).toBe(
      false,
    );
    expect(await fs.pathExists(path.join(worldPath, "level.dat"))).toBe(true);
  });

  it("takes a safety backup before overwriting the world", async () => {
    await seedWorld("first");

    const first = await createWorldBackup(worldPath, "manual", 5);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await fs.writeFile(path.join(worldPath, "region", "r.0.0.mca"), "second");

    const restored = await restoreWorldBackup(first.backup.id, worldPath, 5);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    expect(restored.safetyBackupId).toBeTruthy();
    expect(await readMarker()).toBe("first");

    await restoreWorldBackup(restored.safetyBackupId!, worldPath, 5);
    expect(await readMarker()).toBe("second");
  });

  it("leaves no displaced folder inside saves after a restore", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect((await restoreWorldBackup(created.backup.id, worldPath, 5)).ok).toBe(
      true,
    );

    const entries = await fs.readdir(savesPath);
    expect(entries.filter((entry) => entry !== WORLD_FOLDER)).toEqual([]);
  });

  it("refuses to create or restore while the instance is running", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    markVersionRunning();

    expect(await createWorldBackup(worldPath, "manual", 5)).toEqual({
      ok: false,
      error: "versionRunning",
    });
    expect(await restoreWorldBackup(created.backup.id, worldPath, 5)).toEqual({
      ok: false,
      error: "versionRunning",
    });
  });

  it("reports a missing world instead of writing an empty archive", async () => {
    await fs.remove(worldPath);

    expect(await createWorldBackup(worldPath, "manual", 5)).toEqual({
      ok: false,
      error: "worldMissing",
    });
  });

  it("rejects an unknown backup id", async () => {
    await seedWorld("original");

    expect(await restoreWorldBackup("../../evil", worldPath, 5)).toEqual({
      ok: false,
      error: "backupMissing",
    });
    expect(await deleteWorldBackup("../../evil")).toEqual({
      ok: false,
      error: "backupMissing",
    });
  });

  it("prunes automatic backups beyond the retention limit", async () => {
    await seedWorld("original");

    const first = await createWorldBackup(worldPath, "auto", 2);
    await fs.writeFile(path.join(worldPath, "level.dat"), "level-2");
    const second = await createWorldBackup(worldPath, "auto", 2);
    await fs.writeFile(path.join(worldPath, "level.dat"), "level-3");
    const third = await createWorldBackup(worldPath, "auto", 2);

    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) return;

    const listed = await getWorldBackupList(worldPath);
    expect(listed.backups.map((entry) => entry.id)).toEqual([
      third.backup.id,
      second.backup.id,
    ]);
    expect(
      await fs.pathExists(path.join(backupsDir, `${first.backup.id}.zip`)),
    ).toBe(false);
  });
});

describe("renaming a world folder", () => {
  it("keeps the backups of the renamed world reachable", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamedFolder = "World1 renamed";
    const renamedPath = path.join(savesPath, renamedFolder);
    await fs.move(worldPath, renamedPath);

    expect(await getWorldBackupList(renamedPath)).toMatchObject({
      backups: [],
    });

    await reassignWorldBackups(
      versionPath,
      WORLD_FOLDER,
      renamedFolder,
      "Renamed world",
    );

    const listed = await getWorldBackupList(renamedPath);
    expect(listed.backups.map((entry) => entry.id)).toEqual([
      created.backup.id,
    ]);
    expect(listed.backups[0].worldName).toBe("Renamed world");

    const counts = await countWorldBackups(versionPath);
    expect(counts[renamedFolder]).toBe(1);
    expect(counts[WORLD_FOLDER]).toBeUndefined();

    const restored = await restoreWorldBackup(
      created.backup.id,
      renamedPath,
      5,
    );
    expect(restored.ok).toBe(true);
    expect(await readMarker(renamedFolder)).toBe("original");
  });

  it("moves preserved copies to the new folder name", async () => {
    await seedWorld("original");
    await fs.ensureDir(path.join(savesPath, ".grubie-restore"));

    const copyPath = path.join(
      savesPath,
      ".grubie-restore",
      `${WORLD_FOLDER}-1700000000000`,
    );
    await fs.ensureDir(copyPath);
    await fs.writeFile(path.join(copyPath, "level.dat"), "preserved");
    await fs.writeFile(
      path.join(copyPath, ".grubie-preserved"),
      WORLD_FOLDER,
      "utf-8",
    );

    const renamedFolder = "World1 renamed";
    const renamedPath = path.join(savesPath, renamedFolder);
    await fs.move(worldPath, renamedPath);

    expect(await getWorldBackupList(renamedPath)).toMatchObject({
      preserved: [],
    });

    await reassignPreservedCopies(savesPath, WORLD_FOLDER, renamedFolder);

    const listed = await getWorldBackupList(renamedPath);
    expect(listed.preserved.map((entry) => entry.path)).toEqual([copyPath]);
  });
});

describe("instance identity", () => {
  const RENAMED_VERSION_NAME = "TestPack renamed";
  const renamedVersionPath = path.join(versionsPath, RENAMED_VERSION_NAME);

  async function stripInstanceIds(): Promise<void> {
    const indexPath = path.join(backupsDir, "index.json");
    const stored = (await fs.readJSON(indexPath)) as IWorldBackup[];

    await fs.writeJSON(
      indexPath,
      stored.map((entry) => {
        const legacy = { ...entry };
        delete legacy.instanceId;
        return legacy;
      }),
    );

    await fs.remove(path.join(versionPath, INSTANCE_ID_FILE));
  }

  afterEach(async () => {
    await fs.remove(renamedVersionPath);
  });

  it("does not hand the backups of a deleted instance to a new one with the same name", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await fs.remove(versionPath);
    await fs.ensureDir(versionPath);
    await seedWorld("fresh");

    expect((await getWorldBackupList(worldPath)).backups).toEqual([]);
    expect(await countWorldBackups(versionPath)).toEqual({});

    const restored = await restoreWorldBackup(created.backup.id, worldPath, 5);
    expect(restored).toEqual({ ok: false, error: "backupMissing" });
    expect(await readMarker()).toBe("fresh");

    expect((await getOrphanBackupsStats()).count).toBe(1);
  });

  it("keeps the backups of a renamed instance", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await fs.move(versionPath, renamedVersionPath);
    const movedWorldPath = path.join(
      renamedVersionPath,
      "saves",
      WORLD_FOLDER,
    );
    const movedMarkerPath = path.join(movedWorldPath, "region", "r.0.0.mca");

    const listed = await getWorldBackupList(movedWorldPath);
    expect(listed.backups.map((entry) => entry.id)).toEqual([
      created.backup.id,
    ]);
    expect((await countWorldBackups(renamedVersionPath))[WORLD_FOLDER]).toBe(1);
    expect((await getOrphanBackupsStats()).count).toBe(0);

    await fs.writeFile(movedMarkerPath, "corrupted");

    const restored = await restoreWorldBackup(
      created.backup.id,
      movedWorldPath,
      5,
    );
    expect(restored.ok).toBe(true);
    expect(await fs.readFile(movedMarkerPath, "utf-8")).toBe("original");
  });

  it("adopts the records of an instance that is still there", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await stripInstanceIds();

    const listed = await getWorldBackupList(worldPath);
    expect(listed.backups.map((entry) => entry.id)).toEqual([
      created.backup.id,
    ]);
    expect((await getOrphanBackupsStats()).count).toBe(0);
  });

  it("never lets a new instance adopt the records of a deleted one", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await stripInstanceIds();
    await fs.remove(versionPath);

    expect((await getOrphanBackupsStats()).count).toBe(1);

    await fs.ensureDir(versionPath);
    await seedWorld("fresh");

    expect((await getWorldBackupList(worldPath)).backups).toEqual([]);
    expect((await getOrphanBackupsStats()).count).toBe(1);
  });
});

describe("safety net", () => {
  it("keeps the old files when the safety backup cannot be made", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await fs.remove(path.join(worldPath, "level.dat"));
    await fs.writeFile(
      path.join(worldPath, "region", "r.0.0.mca"),
      "unsaved-progress",
    );

    const restored = await restoreWorldBackup(created.backup.id, worldPath, 5);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    expect(restored.safetyBackupId).toBeNull();
    expect(restored.preservedPath).toBeTruthy();
    expect(hoisted.trashed).toEqual([]);

    expect(await readMarker()).toBe("original");
    expect(
      await fs.readFile(
        path.join(restored.preservedPath!, "region", "r.0.0.mca"),
        "utf-8",
      ),
    ).toBe("unsaved-progress");
  });

  it("keeps a preserved copy reachable and deletable from the dialog", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await fs.remove(path.join(worldPath, "level.dat"));
    const restored = await restoreWorldBackup(created.backup.id, worldPath, 5);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    const listed = await getWorldBackupList(worldPath);
    expect(listed.preserved).toHaveLength(1);
    expect(listed.preserved[0].path).toBe(restored.preservedPath);
    expect(listed.preserved[0].size).toBeGreaterThan(0);
    expect(listed.preserved[0].createdAt).toBeGreaterThan(0);

    expect(await deletePreservedCopy(restored.preservedPath!)).toEqual({
      ok: true,
    });
    expect((await getWorldBackupList(worldPath)).preserved).toEqual([]);
  });

  it("does not leak a preserved copy into a world with a shared prefix", async () => {
    await seedWorld("first", WORLD_FOLDER);
    await seedWorld("second", `${WORLD_FOLDER}-2`);

    const neighbourPath = path.join(savesPath, `${WORLD_FOLDER}-2`);
    const created = await createWorldBackup(neighbourPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await fs.remove(path.join(neighbourPath, "level.dat"));
    const restored = await restoreWorldBackup(
      created.backup.id,
      neighbourPath,
      5,
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    expect(restored.preservedPath).toBeTruthy();
    expect((await getWorldBackupList(worldPath)).preserved).toEqual([]);
    expect(
      (await getWorldBackupList(neighbourPath)).preserved.map((c) => c.path),
    ).toEqual([restored.preservedPath]);
  });

  it("offers a way out for copies orphaned by a world rename", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await fs.remove(path.join(worldPath, "level.dat"));
    const restored = await restoreWorldBackup(created.backup.id, worldPath, 5);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    await fs.move(worldPath, path.join(savesPath, "RenamedWorld"));

    const stats = await getOrphanBackupsStats();
    expect(stats.count).toBeGreaterThanOrEqual(1);
    expect(stats.size).toBeGreaterThan(0);

    await cleanupOrphanBackups();
    expect(await fs.pathExists(restored.preservedPath!)).toBe(false);
  });

  it("refuses to delete a path outside the preserved folder", async () => {
    await seedWorld("original");

    expect(await deletePreservedCopy(worldPath)).toEqual({
      ok: false,
      error: "backupMissing",
    });
    expect(await fs.pathExists(worldPath)).toBe(true);
  });

  it("never drops the newest safety copy after another play session", async () => {
    await seedWorld("original");

    const anchor = await createWorldBackup(worldPath, "manual", 5);
    expect(anchor.ok).toBe(true);
    if (!anchor.ok) return;

    let latestSafetyId: string | null = null;
    for (const marker of ["r1", "r2", "r3", "hundred-hours"]) {
      await fs.writeFile(path.join(worldPath, "level.dat"), `level-${marker}`);
      await fs.writeFile(
        path.join(worldPath, "region", "r.0.0.mca"),
        marker,
      );

      const restored = await restoreWorldBackup(anchor.backup.id, worldPath, 5);
      expect(restored.ok).toBe(true);
      if (!restored.ok) return;

      latestSafetyId = restored.safetyBackupId;
    }

    expect(latestSafetyId).toBeTruthy();

    const levelDat = path.join(worldPath, "level.dat");
    await fs.writeFile(levelDat, "level-next-session");
    const played = (Date.now() + 1000) / 1000;
    await fs.utimes(levelDat, played, played);
    expect(await runAutoBackupForVersion(versionPath, 5, 0)).toBe(1);

    const listed = await getWorldBackupList(worldPath);
    expect(listed.backups.map((entry) => entry.id)).toContain(latestSafetyId);

    expect((await restoreWorldBackup(latestSafetyId!, worldPath, 5)).ok).toBe(
      true,
    );
    expect(await readMarker()).toBe("hundred-hours");
  });

  it("never drops the oldest safety copy when restoring repeatedly", async () => {
    await seedWorld("my-real-world");

    const points: string[] = [];
    for (const marker of ["a", "b", "c", "d"]) {
      await fs.writeFile(path.join(worldPath, "level.dat"), `level-${marker}`);
      await fs.writeFile(
        path.join(worldPath, "region", "r.0.0.mca"),
        `state-${marker}`,
      );

      const created = await createWorldBackup(worldPath, "manual", 5);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      points.push(created.backup.id);
    }

    await fs.writeFile(
      path.join(worldPath, "region", "r.0.0.mca"),
      "my-real-world",
    );

    let firstSafetyId: string | null = null;
    for (const id of points) {
      const restored = await restoreWorldBackup(id, worldPath, 5);
      expect(restored.ok).toBe(true);
      if (!restored.ok) return;

      firstSafetyId = firstSafetyId ?? restored.safetyBackupId;
    }

    expect(firstSafetyId).toBeTruthy();

    const listed = await getWorldBackupList(worldPath);
    expect(listed.backups.map((entry) => entry.id)).toContain(firstSafetyId);

    expect((await restoreWorldBackup(firstSafetyId!, worldPath, 5)).ok).toBe(
      true,
    );
    expect(await readMarker()).toBe("my-real-world");
  });

});

describe("automatic backups", () => {
  it("only archives worlds touched during the session", async () => {
    const sessionStart = Date.now() - 5_000;

    await seedWorld("played", WORLD_FOLDER);
    await seedWorld("untouched", "World2");

    const old = new Date(sessionStart - 60_000);
    await fs.utimes(path.join(savesPath, "World2", "level.dat"), old, old);

    expect(await runAutoBackupForVersion(versionPath, 5, sessionStart)).toBe(1);

    const counts = await countWorldBackups(versionPath);
    expect(counts[WORLD_FOLDER]).toBe(1);
    expect(counts["World2"]).toBeUndefined();
  });

  it("does nothing while another instance of the version is running", async () => {
    await seedWorld("played");
    markVersionRunning();

    expect(await runAutoBackupForVersion(versionPath, 5, 0)).toBe(0);
    expect(await listBackupZips()).toEqual([]);
  });

  it("records a skip reason the world dialog can surface", async () => {
    await seedWorld("original");
    const instanceId = await stampInstanceId();
    await fs.ensureDir(backupsDir);
    await fs.writeJSON(path.join(backupsDir, "skipped.json"), {
      [`${instanceId}::${WORLD_FOLDER}`]: "worldTooLarge",
    });

    expect((await getWorldBackupList(worldPath)).skipReason).toBe(
      "worldTooLarge",
    );

    expect((await createWorldBackup(worldPath, "manual", 5)).ok).toBe(true);
    expect((await getWorldBackupList(worldPath)).skipReason).toBeNull();
  });

  it("stops re-archiving a world that already failed at this size", async () => {
    await seedWorld("original");
    const instanceId = await stampInstanceId();
    await fs.ensureDir(backupsDir);
    await fs.writeJSON(path.join(backupsDir, "skipped.json"), {
      [`${instanceId}::${WORLD_FOLDER}`]: {
        reason: "worldTooLarge",
        sourceSize: 1,
      },
    });

    expect(await createWorldBackup(worldPath, "auto", 5)).toEqual({
      ok: false,
      error: "worldTooLarge",
    });
    expect(await listBackupZips()).toEqual([]);
  });
});

describe("a damaged backup index", () => {
  it("never becomes an empty one that overwrites the real list", async () => {
    await seedWorld("original");

    const first = await createWorldBackup(worldPath, "manual", 5);
    expect(first.ok).toBe(true);
    const second = await createWorldBackup(worldPath, "manual", 5);
    expect(second.ok).toBe(true);

    const indexPath = path.join(backupsDir, "index.json");
    const intact = await fs.readFile(indexPath, "utf-8");
    await fs.writeFile(indexPath, intact.slice(0, 40));

    const third = await createWorldBackup(worldPath, "manual", 5);
    expect(third.ok).toBe(false);

    expect(await fs.readFile(indexPath, "utf-8")).toBe(intact.slice(0, 40));
    expect(await listBackupZips()).toHaveLength(2);

    await fs.writeFile(indexPath, intact);
    expect((await getWorldBackupList(worldPath)).backups).toHaveLength(2);
  });

  it("does not let a delete wipe the archive it could not index", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const indexPath = path.join(backupsDir, "index.json");
    await fs.writeFile(indexPath, "{ not a list");

    const deleted = await deleteWorldBackup(created.backup.id);
    expect(deleted.ok).toBe(false);
    expect(
      await fs.pathExists(path.join(backupsDir, `${created.backup.id}.zip`)),
    ).toBe(true);
  });
});

describe("orphan cleanup", () => {
  it("removes archives that lost their index entry", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);

    const strayId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await fs.writeFile(path.join(backupsDir, `${strayId}.zip`), "stray");

    const stats = await getOrphanBackupsStats();
    expect(stats.count).toBe(1);

    const cleaned = await cleanupOrphanBackups();
    expect(cleaned.count).toBe(1);
    expect(await fs.pathExists(path.join(backupsDir, `${strayId}.zip`))).toBe(
      false,
    );
    expect((await getWorldBackupList(worldPath)).backups).toHaveLength(1);
  });

  it("refuses to touch anything when the index is unreadable", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);

    const indexPath = path.join(backupsDir, "index.json");
    const intact = await fs.readFile(indexPath, "utf-8");
    await fs.writeFile(indexPath, intact.slice(0, intact.length - 12));

    await expect(getOrphanBackupsStats()).rejects.toThrow();
    await expect(cleanupOrphanBackups()).rejects.toThrow();

    expect(await listBackupZips()).toHaveLength(1);
    expect(await fs.readFile(indexPath, "utf-8")).toBe(
      intact.slice(0, intact.length - 12),
    );
  });

  it("does not declare every backup an orphan when the instances folder is gone", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);

    await fs.remove(versionsPath);

    await expect(cleanupOrphanBackups()).rejects.toThrow();
    expect(await listBackupZips()).toHaveLength(1);
  });

  it("removes backups of versions that no longer exist", async () => {
    await seedWorld("original");

    const created = await createWorldBackup(worldPath, "manual", 5);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await fs.remove(versionPath);

    const cleaned = await cleanupOrphanBackups();
    expect(cleaned.count).toBe(1);
    expect(
      await fs.pathExists(path.join(backupsDir, `${created.backup.id}.zip`)),
    ).toBe(false);
  });
});

describe("recoverPendingRestore", () => {
  it("puts the world back when the swap was interrupted", async () => {
    await seedWorld("original");

    const displacedPath = path.join(savesPath, ".grubie-restore", "World1-1");
    await fs.ensureDir(path.dirname(displacedPath));
    await fs.move(worldPath, displacedPath);

    await fs.ensureDir(backupsDir);
    await fs.writeJSON(path.join(backupsDir, "pending-restore.json"), {
      worldPath,
      displacedPath,
    });

    await recoverPendingRestore();

    expect(await fs.pathExists(worldPath)).toBe(true);
    expect(await readMarker()).toBe("original");
    expect(await fs.pathExists(displacedPath)).toBe(false);
    expect(
      await fs.pathExists(path.join(backupsDir, "pending-restore.json")),
    ).toBe(false);
  });

  it("keeps a displaced copy that was marked for preserving", async () => {
    await seedWorld("restored");

    const displacedPath = path.join(savesPath, ".grubie-restore", "World1-1");
    await fs.ensureDir(displacedPath);
    await fs.writeFile(path.join(displacedPath, "level.dat"), "preserved");

    await fs.ensureDir(backupsDir);
    await fs.writeJSON(path.join(backupsDir, "pending-restore.json"), {
      worldPath,
      displacedPath,
      keepDisplaced: true,
    });

    await recoverPendingRestore();

    expect(await readMarker()).toBe("restored");
    expect(await fs.pathExists(displacedPath)).toBe(true);
    expect(
      await fs.pathExists(path.join(backupsDir, "pending-restore.json")),
    ).toBe(false);
  });

  it("drops the displaced copy when the swap already finished", async () => {
    await seedWorld("restored");

    const displacedPath = path.join(savesPath, ".grubie-restore", "World1-1");
    await fs.ensureDir(displacedPath);
    await fs.writeFile(path.join(displacedPath, "level.dat"), "stale");

    await fs.ensureDir(backupsDir);
    await fs.writeJSON(path.join(backupsDir, "pending-restore.json"), {
      worldPath,
      displacedPath,
    });

    await recoverPendingRestore();

    expect(await readMarker()).toBe("restored");
    expect(await fs.pathExists(displacedPath)).toBe(false);
  });
});

describe("createWorldBackup with an unreadable subfolder", () => {
  const denyRead = (target: string): boolean => {
    if (process.platform === "win32") {
      try {
        execFileSync(
          "icacls",
          [target, "/deny", `${process.env.USERNAME}:(RX)`],
          { stdio: "ignore" },
        );
      } catch {
        return false;
      }
    } else {
      try {
        fs.chmodSync(target, 0o000);
      } catch {
        return false;
      }
    }

    try {
      fs.readdirSync(target);
      return false;
    } catch {
      return true;
    }
  };

  const allowRead = (target: string): void => {
    if (process.platform === "win32") {
      try {
        execFileSync("icacls", [target, "/remove:d", `${process.env.USERNAME}`], {
          stdio: "ignore",
        });
      } catch {}
    } else {
      fs.chmodSync(target, 0o755);
    }
  };

  it("refuses instead of writing a silently incomplete archive", async () => {
    await seedWorld("full");
    const region = path.join(worldPath, "region");

    if (!denyRead(region)) return;

    try {
      const result = await createWorldBackup(worldPath, "manual");

      expect(result).toEqual({ ok: false, error: "worldUnreadable" });
      expect(await listBackupZips()).toEqual([]);
      expect((await getWorldBackupList(worldPath)).backups).toEqual([]);
    } finally {
      allowRead(region);
    }
  });
});

describe("automatic backups that keep failing", () => {
  it("leaves a visible reason instead of silently doing nothing", async () => {
    await seedWorld("auto");

    const blocked = path.join(worldPath, "region", "r.0.0.mca");
    if (process.platform !== "win32") return;

    try {
      execFileSync(
        "icacls",
        [blocked, "/deny", `${process.env.USERNAME}:(R)`],
        { stdio: "ignore" },
      );
    } catch {
      return;
    }

    try {
      fs.readFileSync(blocked);
      return;
    } catch {}

    try {
      const result = await createWorldBackup(worldPath, "auto");

      expect(result).toEqual({ ok: false, error: "failed" });
      expect((await getWorldBackupList(worldPath)).skipReason).toBe("failed");
      expect(await listBackupZips()).toEqual([]);
    } finally {
      try {
        execFileSync(
          "icacls",
          [blocked, "/remove:d", `${process.env.USERNAME}`],
          { stdio: "ignore" },
        );
      } catch {}
    }
  });
});
