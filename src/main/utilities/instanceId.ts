import fs from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";
import { INSTANCE_ID_FILE } from "@/shared/instancePrivacy";

const INSTANCE_ID_PATTERN = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function getInstanceIdPath(versionPath: string): string {
  return path.join(path.resolve(versionPath), INSTANCE_ID_FILE);
}

export async function readInstanceId(
  versionPath: string,
): Promise<string | null> {
  const stored = await fs
    .readFile(getInstanceIdPath(versionPath), "utf-8")
    .catch(() => null);

  const id = stored?.trim().toLowerCase() ?? "";
  return INSTANCE_ID_PATTERN.test(id) ? id : null;
}

export async function ensureInstanceId(
  versionPath: string,
): Promise<string | null> {
  const existing = await readInstanceId(versionPath);
  if (existing) return existing;

  const resolved = path.resolve(versionPath);
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats?.isDirectory()) return null;

  const target = getInstanceIdPath(resolved);
  const id = randomUUID();

  try {
    await fs.writeFile(target, id, { encoding: "utf-8", flag: "wx" });
    return id;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== "EEXIST") {
      console.error(`[instances] cannot write ${target}:`, error);
      return null;
    }
  }

  const stored = await readInstanceId(resolved);
  if (stored) return stored;

  try {
    await fs.writeFile(target, id, "utf-8");
    return id;
  } catch (error) {
    console.error(`[instances] cannot repair ${target}:`, error);
    return null;
  }
}

export function removeInstanceIdSync(versionPath: string): void {
  try {
    fs.removeSync(getInstanceIdPath(versionPath));
  } catch (error) {
    console.error(`[instances] cannot drop the imported id:`, error);
  }
}
