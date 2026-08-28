import fs from "fs-extra";
import path from "path";
import { WORLDS_ROOT, getWorldFolderFromPath } from "@/shared/worldPrivacy";

export async function listExistingWorldFolders(
  instancePath: string,
): Promise<Set<string>> {
  const savesPath = path.join(instancePath, WORLDS_ROOT);
  const entries = await fs
    .readdir(savesPath, { withFileTypes: true })
    .catch(() => []);

  const worlds = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!(await fs.pathExists(path.join(savesPath, entry.name, "level.dat")))) {
      continue;
    }
    worlds.add(entry.name.toLowerCase());
  }

  return worlds;
}

export function isKeptWorldEntry(
  entryName: string,
  keptWorlds: ReadonlySet<string>,
): boolean {
  const folder = getWorldFolderFromPath(entryName);
  return folder !== null && keptWorlds.has(folder);
}
