import fs from "fs-extra";
import path from "path";
import { assertSafeVersionName } from "@/shared/versionName";
import { sanitizeImportedVersionConf } from "./versions";
import { getDataRoot } from "./dataRoot";
import type { IVersionConf } from "@/types/IVersion";

export const DUPLICATE_SOURCE_MISSING = "duplicate_source_missing";
export const DUPLICATE_NAME_TAKEN = "duplicate_name_taken";

const SKIPPED_ROOT_ENTRIES = new Set([
  "logs",
  "crash-reports",
  "natives",
  "downloads",
]);

const SKIPPED_RELATIVE_PATHS = new Set([
  path.join("storage", "loader-rollback"),
]);

function getVersionsPath(): string {
  return path.join(getDataRoot(), "minecraft", "versions");
}

function isCopiedEntry(sourcePath: string, entryPath: string): boolean {
  const relative = path.relative(sourcePath, entryPath);
  if (!relative) return true;

  const [head] = relative.split(path.sep);
  if (SKIPPED_ROOT_ENTRIES.has(head)) return false;

  return !SKIPPED_RELATIVE_PATHS.has(relative);
}

export async function duplicateVersion(
  sourceName: string,
  targetName: string,
): Promise<IVersionConf> {
  assertSafeVersionName(sourceName);
  assertSafeVersionName(targetName);

  const versionsPath = getVersionsPath();
  const sourcePath = path.join(versionsPath, sourceName);
  const targetPath = path.join(versionsPath, targetName);

  if (path.resolve(sourcePath) === path.resolve(targetPath)) {
    throw new Error(DUPLICATE_NAME_TAKEN);
  }

  if (!(await fs.pathExists(path.join(sourcePath, "version.json")))) {
    throw new Error(DUPLICATE_SOURCE_MISSING);
  }

  if (await fs.pathExists(targetPath)) {
    throw new Error(DUPLICATE_NAME_TAKEN);
  }

  try {
    await fs.copy(sourcePath, targetPath, {
      filter: (entryPath) => isCopiedEntry(sourcePath, entryPath),
    });

    const targetConfPath = path.join(targetPath, "version.json");
    const conf = (await fs.readJSON(targetConfPath, "utf-8")) as IVersionConf;
    const duplicated = sanitizeImportedVersionConf(conf, targetPath);

    duplicated.name = targetName;
    duplicated.lastLaunch = undefined;
    duplicated.lastUpdate = new Date();

    await fs.writeJSON(targetConfPath, duplicated, { spaces: 2 });

    return duplicated;
  } catch (error) {
    await fs.remove(targetPath).catch(() => {});
    throw error;
  }
}
