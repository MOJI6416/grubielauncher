import path from "path";
import type {
  ModBisectApplyResult,
  ModBisectBeginResult,
  ModBisectSession,
  ModIdConflict,
} from "@/types/ModBisect";
import { check, handleSafe } from "../utilities/ipc";
import { assertReadablePath, assertWritablePath } from "../utilities/safePath";
import { isVersionRunning } from "../utilities/worldBackups";
import {
  beginBisect,
  finishBisect,
  listBisectSessions,
  readBisectSession,
  saveBisect,
} from "../game/modBisect";
import { findModIdConflicts } from "../utilities/modIdConflicts";

const isPath = check.nonEmptyString(4096);
const isPaths = check.arrayOf(isPath, 2000);
const isObject = check.object();
const isNames = check.arrayOf(check.nonEmptyString(255), 5000);

function writableModsOf(versionPath: string, label: string): void {
  assertWritablePath(path.join(versionPath, "mods"), label);
  assertWritablePath(path.join(versionPath, "storage"), label);
}

export function registerModBisectIpc() {
  handleSafe<ModBisectSession | null, [string]>(
    "bisect:read",
    null,
    [isPath],
    async (_, versionPath) => {
      assertReadablePath(versionPath, "bisect:read");
      return readBisectSession(versionPath);
    },
  );

  handleSafe<string[], [string[]]>(
    "bisect:list",
    [],
    [isPaths],
    async (_, versionPaths) => {
      versionPaths.forEach((versionPath) =>
        assertReadablePath(versionPath, "bisect:list"),
      );
      return listBisectSessions(versionPaths);
    },
  );

  handleSafe<ModBisectBeginResult, [string, unknown]>(
    "bisect:begin",
    { ok: false, reason: "changed" },
    [isPath, isObject],
    async (_, versionPath, draft) => {
      writableModsOf(versionPath, "bisect:begin");
      return beginBisect(versionPath, draft, isVersionRunning(versionPath));
    },
  );

  handleSafe<ModBisectApplyResult, [string, unknown]>(
    "bisect:save",
    { ok: false, reason: "changed" },
    [isPath, isObject],
    async (_, versionPath, session) => {
      writableModsOf(versionPath, "bisect:save");
      return saveBisect(versionPath, session, isVersionRunning(versionPath));
    },
  );

  handleSafe<ModBisectApplyResult, [string, string[]]>(
    "bisect:finish",
    { ok: false, reason: "changed" },
    [isPath, isNames],
    async (_, versionPath, disable) => {
      writableModsOf(versionPath, "bisect:finish");
      return finishBisect(versionPath, disable, isVersionRunning(versionPath));
    },
  );

  handleSafe<ModIdConflict[], [string]>(
    "modManager:modIdConflicts",
    [],
    [isPath],
    async (_, versionPath) => {
      assertReadablePath(
        path.join(versionPath, "mods"),
        "modManager:modIdConflicts",
      );
      return findModIdConflicts(versionPath);
    },
  );
}
