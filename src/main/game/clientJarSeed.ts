import path from "path";
import fs from "fs-extra";
import { getSha1 } from "../utilities/files";

export async function seedClientJar(
  versionsPath: string,
  destination: string,
  client: { sha1?: string; size?: number } | undefined,
): Promise<boolean> {
  const sha1 = client?.sha1?.toLowerCase();
  const size = client?.size;
  if (!sha1 || !size) return false;

  const current = await fs.stat(destination).catch(() => null);
  if (current?.size === size) return false;

  const ownFolder = path.resolve(path.dirname(destination));
  const fileName = path.basename(destination);
  const entries = await fs
    .readdir(versionsPath, { withFileTypes: true })
    .catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(versionsPath, entry.name);
    if (path.resolve(folder) === ownFolder) continue;

    const candidate = path.join(folder, fileName);
    const stats = await fs.stat(candidate).catch(() => null);
    if (!stats?.isFile() || stats.size !== size) continue;

    const hash = await getSha1(candidate).catch(() => null);
    if (hash?.toLowerCase() !== sha1) continue;

    try {
      await fs.ensureDir(path.dirname(destination));
      await fs.copyFile(candidate, destination);
      return true;
    } catch {
      await fs.remove(destination).catch(() => {});
      return false;
    }
  }

  return false;
}
