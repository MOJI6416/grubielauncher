import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";

const NON_ASCII = /[^ -~\t\r\n]/;
const EXTENDED_PATH_PREFIX = /^\\\\\?\\/;

export const LAUNCH_ALIAS_FOLDER = "launch";

export function hasNonAsciiPath(target: string): boolean {
  return NON_ASCII.test(target);
}

export function needsLaunchAlias(
  target: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "win32" && hasNonAsciiPath(target);
}

export function buildLaunchAliasName(target: string): string {
  const hash = createHash("sha1")
    .update(target.toLowerCase())
    .digest("hex")
    .slice(0, 12);

  const segment = target.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const ascii = segment.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 16);

  return ascii ? `${ascii}-${hash}` : `instance-${hash}`;
}

export function normalizeLinkTarget(link: string): string {
  return path.resolve(link.replace(EXTENDED_PATH_PREFIX, ""));
}

async function readAliasTarget(aliasPath: string): Promise<string | null> {
  const stats = await fs.lstat(aliasPath).catch(() => null);
  if (!stats) return null;
  if (!stats.isSymbolicLink()) return "";

  const link = await fs.readlink(aliasPath).catch(() => null);
  return link === null ? "" : normalizeLinkTarget(link);
}

async function pruneDanglingAliases(basePath: string) {
  const names = await fs.readdir(basePath).catch(() => [] as string[]);

  for (const name of names) {
    const aliasPath = path.join(basePath, name);
    const target = await readAliasTarget(aliasPath);
    if (target === null || target === "") continue;
    if (await fs.pathExists(target)) continue;
    await fs.remove(aliasPath).catch(() => {});
  }
}

export async function resolveLaunchPath(
  target: string,
  launcherPath: string,
): Promise<string> {
  if (!needsLaunchAlias(target)) return target;

  const basePath = path.join(launcherPath, LAUNCH_ALIAS_FOLDER);
  if (hasNonAsciiPath(basePath)) {
    console.warn(
      `[launch:alias] cannot build an ASCII path for ${target}: the launcher folder itself is not ASCII`,
    );
    return target;
  }

  const aliasPath = path.join(basePath, buildLaunchAliasName(target));
  const resolvedTarget = path.resolve(target);

  try {
    await fs.ensureDir(basePath);
    await pruneDanglingAliases(basePath);

    const current = await readAliasTarget(aliasPath);
    if (current === resolvedTarget) return aliasPath;
    if (current !== null) await fs.remove(aliasPath);

    await fs.symlink(resolvedTarget, aliasPath, "junction");
  } catch (error) {
    console.error(
      `[launch:alias] failed to create an ASCII path for ${target}:`,
      error,
    );
    return target;
  }

  return aliasPath;
}
