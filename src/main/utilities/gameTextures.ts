import fs from "fs-extra";
import path from "path";
import { LARGE_ARCHIVE_LIMITS, readZipEntries } from "./archiver";
import { getDataRoot } from "./dataRoot";

export const GAME_TEXTURE_ENTRY =
  /^assets\/minecraft\/textures\/[a-z0-9_/]+\.png$/;

const GAME_VERSION_ID = /^\d[\w.-]*$/;

export interface ClientJar {
  id: string;
  jar: string;
}

export interface GameTextures {
  version: string;
  files: Record<string, Buffer>;
}

export function compareGameVersions(left: string, right: string): number {
  const a = left.split(/\D+/).filter(Boolean).map(Number);
  const b = right.split(/\D+/).filter(Boolean).map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export async function findClientJars(
  versionsDir: string,
): Promise<ClientJar[]> {
  const folders = await fs
    .readdir(versionsDir, { withFileTypes: true })
    .catch(() => []);
  const jars: ClientJar[] = [];

  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const folderPath = path.join(versionsDir, folder.name);
    const files = new Set(await fs.readdir(folderPath).catch(() => []));

    for (const file of files) {
      if (!file.endsWith(".jar")) continue;
      const id = file.slice(0, -".jar".length);
      if (!GAME_VERSION_ID.test(id) || !files.has(`${id}.json`)) continue;
      jars.push({ id, jar: path.join(folderPath, file) });
    }
  }

  return jars.sort((a, b) => compareGameVersions(b.id, a.id));
}

export async function readGameTextures(
  names: readonly string[],
): Promise<GameTextures | null> {
  const wanted = new Set(names.filter((name) => GAME_TEXTURE_ENTRY.test(name)));
  const versionsDir = path.join(getDataRoot(), "minecraft", "versions");

  for (const client of await findClientJars(versionsDir)) {
    const entries = await readZipEntries(
      client.jar,
      wanted,
      LARGE_ARCHIVE_LIMITS,
    ).catch(() => null);
    if (!entries || entries.size === 0) continue;
    return { version: client.id, files: Object.fromEntries(entries) };
  }

  return null;
}
