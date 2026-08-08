import fs from "fs-extra";
import path from "path";
import { TSettings } from "@/types/Settings";
import { normalizeWorldBackupKeep } from "@/types/WorldBackup";
import { getLauncherPaths } from "../utilities/other";
import { gameRuntime } from "../utilities/runtime";
import {
  recoverPendingRestore,
  runAutoBackupForVersion,
} from "../utilities/worldBackups";

interface TrackedSession {
  versionPath: string;
  startedAt: number;
}

const trackedSessions = new Map<string, TrackedSession>();

async function readSettings(): Promise<Partial<TSettings> | null> {
  const { launcher } = getLauncherPaths();

  return (await fs
    .readJSON(path.join(launcher, "settings.json"))
    .catch(() => null)) as Partial<TSettings> | null;
}

async function runAutoBackup(session: TrackedSession): Promise<void> {
  try {
    const settings = await readSettings();
    if (settings?.autoWorldBackup === false) return;

    await runAutoBackupForVersion(
      session.versionPath,
      normalizeWorldBackupKeep(settings?.worldBackupKeep),
      session.startedAt,
    );
  } catch (error) {
    console.error("Automatic world backup failed:", error);
  }
}

export function initWorldBackupService(): void {
  void recoverPendingRestore();

  gameRuntime.on("started", (event) => {
    const record = gameRuntime.get(event.versionName, event.instance);
    if (!record?.versionPath) return;

    trackedSessions.set(event.key, {
      versionPath: record.versionPath,
      startedAt: Date.now(),
    });
  });

  gameRuntime.on("close", (event) => {
    const session = trackedSessions.get(event.key);
    trackedSessions.delete(event.key);

    if (!session) return;
    void runAutoBackup(session);
  });
}
