import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";

const TMP = path.join(os.tmpdir(), `stats-${process.pid}-${Date.now()}`);

vi.mock("electron", () => ({
  app: { getPath: () => TMP },
  BrowserWindow: { getAllWindows: () => [] },
}));

const {
  beginSession,
  markSessionReady,
  endSession,
  readSyncQueue,
  resolveSyncEntries,
} = await import("./statistics");

const versionPath = path.join(TMP, "instances", "Repro");
const statisticsFile = path.join(versionPath, "statistics.json");
const sessionsFile = path.join(versionPath, "sessions.json");
const syncQueueFile = path.join(TMP, ".grubielauncher", "playtime", "sync-queue.json");
const corruptedDir = path.join(TMP, ".grubielauncher", "playtime", "corrupted");

async function play(instance: number, accountSub: string | null = null): Promise<void> {
  beginSession({
    versionName: "Repro",
    versionPath,
    instance,
    trackStatistics: true,
    accountSub,
  });
  markSessionReady("Repro", instance);
  await endSession("Repro", instance, 0);
}

async function quarantinedNames(): Promise<string[]> {
  return (await fs.readdir(corruptedDir).catch(() => [])) as string[];
}

describe("statistics survive a damaged store", () => {
  beforeEach(async () => {
    await fs.remove(TMP);
    await fs.ensureDir(versionPath);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await fs.remove(TMP);
  });

  it("keeps playtime and launches when statistics.json is truncated", async () => {
    await fs.writeFile(
      statisticsFile,
      '{"playTime": 432000, "launches": 118, "lastLau',
    );
    await fs.writeJSON(sessionsFile, [
      {
        id: "old-1",
        startedAt: "x",
        endedAt: "y",
        durationSec: 100,
        exitCode: 0,
        crashed: false,
      },
    ]);

    await play(0);

    const agg = await fs.readJSON(statisticsFile);
    expect(agg.launches).toBe(119);
    expect(agg.playTime).toBe(432000);

    const sessions = await fs.readJSON(sessionsFile);
    expect(sessions.map((s: { id: string }) => s.id)).toContain("old-1");

    const kept = await quarantinedNames();
    expect(kept.some((name) => name.startsWith("statistics.json."))).toBe(true);
    expect(
      await fs.readFile(path.join(corruptedDir, kept[0]), "utf-8"),
    ).toContain("432000");
  });

  it("does not lose recorded sessions when sessions.json is damaged", async () => {
    await fs.writeFile(sessionsFile, '[{"id":"old-1","durationS');

    await play(0);

    const sessions = await fs.readJSON(sessionsFile);
    expect(sessions).toHaveLength(1);

    const kept = await quarantinedNames();
    expect(kept.some((name) => name.startsWith("sessions.json."))).toBe(true);
    expect(
      await fs.readFile(
        path.join(
          corruptedDir,
          kept.find((name) => name.startsWith("sessions.json.")) as string,
        ),
        "utf-8",
      ),
    ).toContain("old-1");
  });

  it("keeps counting from zero only when there is no file at all", async () => {
    await play(0);

    const agg = await fs.readJSON(statisticsFile);
    expect(agg.launches).toBe(1);
    expect(await quarantinedNames()).toHaveLength(0);
  });

  it("marks a session the launcher cut short instead of calling it a clean exit", async () => {
    await play(0);
    beginSession({
      versionName: "Repro",
      versionPath,
      instance: 1,
      trackStatistics: true,
      accountSub: null,
    });
    markSessionReady("Repro", 1);
    await endSession("Repro", 1, 0, { recovered: true });

    const sessions = await fs.readJSON(sessionsFile);
    expect(sessions[0].recovered).toBeUndefined();
    expect(sessions[1].recovered).toBe(true);
    expect(sessions[1].crashed).toBe(false);
  });

  it("does not drop queued playtime when sync-queue.json is damaged", async () => {
    await fs.ensureDir(path.dirname(syncQueueFile));
    await fs.writeFile(syncQueueFile, '[{"id":"queued-1","sub":"u1","seconds":60');

    expect(await readSyncQueue()).toEqual([]);

    const kept = await quarantinedNames();
    expect(kept.some((name) => name.startsWith("sync-queue.json."))).toBe(true);
    expect(
      await fs.readFile(path.join(corruptedDir, kept[0]), "utf-8"),
    ).toContain("queued-1");
  });

  it("keeps the queue intact when resolving entries", async () => {
    await fs.ensureDir(path.dirname(syncQueueFile));
    await fs.writeJSON(syncQueueFile, [
      { id: "a", sub: "u1", seconds: 10, createdAt: "x" },
      { id: "b", sub: "u1", seconds: 20, createdAt: "y" },
    ]);

    await resolveSyncEntries(["a"]);

    expect((await readSyncQueue()).map((entry) => entry.id)).toEqual(["b"]);
  });
  it("does not trust a number the truncation cut in half", async () => {
    await fs.writeFile(statisticsFile, '{"playTime": 432000, "launches": 11');

    await play(0);

    const agg = await fs.readJSON(statisticsFile);
    expect(agg.playTime).toBe(432000);
    expect(agg.launches).toBe(1);
  });

  it("still ends the session when the instance folder cannot be written", async () => {
    await fs.remove(versionPath);
    await fs.writeFile(versionPath, "this is a file, not a folder");

    await expect(play(0)).resolves.toBeUndefined();
    expect(await fs.readFile(versionPath, "utf-8")).toBe(
      "this is a file, not a folder",
    );
  });

  it("records every instance when the launcher closes with several running", async () => {
    for (const instance of [0, 1, 2]) {
      beginSession({
        versionName: "Repro",
        versionPath,
        instance,
        trackStatistics: true,
        accountSub: null,
      });
      markSessionReady("Repro", instance);
    }

    await Promise.all(
      [0, 1, 2].map((instance) =>
        endSession("Repro", instance, 0, { recovered: true }),
      ),
    );

    const agg = await fs.readJSON(statisticsFile);
    const sessions = await fs.readJSON(sessionsFile);

    expect(agg.launches).toBe(3);
    expect(sessions).toHaveLength(3);
    expect(sessions.every((s: { recovered?: boolean }) => s.recovered)).toBe(
      true,
    );
  });
});
