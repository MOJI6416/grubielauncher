import crypto from "crypto";
import fs from "fs-extra";
import { promises as fsp } from "fs";
import path from "path";
import { getLauncherPaths } from "./other";

export const CONTENT_STORE_DIR = "content-store";

const CONTENT_FOLDERS = new Set(["mods", "resourcepacks", "shaderpacks"]);
const CONTENT_FILE = /\.(?:jar|zip)(?:\.disabled)?$/i;
const SHA1 = /^[0-9a-f]{40}$/;
const LINK_SUFFIX = ".grubie-link";
const UNSUPPORTED_LINK_ERRORS = new Set([
  "EXDEV",
  "EISDIR",
  "ENOTSUP",
  "EOPNOTSUPP",
  "ENOSYS",
  "EINVAL",
  ...(process.platform === "win32" ? [] : ["EPERM"]),
]);

export interface ContentStoreRoots {
  versions: string;
  store: string;
}

export interface DedupeProgress {
  done: number;
  total: number;
}

export interface DedupeResult {
  freed: number;
  linked: number;
  unsupported: boolean;
}

export interface ContentStoreStats {
  saved: number;
  potential: number;
  duplicates: number;
  orphans: number;
  orphanBytes: number;
}

interface FileInfo {
  id: string;
  dev: string;
  size: number;
  links: number;
  stamp: string;
}

const verified = new Map<string, string>();
const unsupportedDevices = new Set<string>();
const locks = new Map<string, Promise<unknown>>();

export function defaultStoreRoots(): ContentStoreRoots {
  const { minecraft } = getLauncherPaths();
  return {
    versions: path.join(minecraft, "versions"),
    store: path.join(minecraft, CONTENT_STORE_DIR),
  };
}

export function isContentFile(
  filePath: string,
  roots: ContentStoreRoots = defaultStoreRoots(),
): boolean {
  const relative = path.relative(roots.versions, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }
  const parts = relative.split(path.sep);
  return (
    parts.length === 3 &&
    CONTENT_FOLDERS.has(parts[1].toLowerCase()) &&
    CONTENT_FILE.test(parts[2])
  );
}

export function storePath(sha1: string, roots: ContentStoreRoots): string {
  return path.join(roots.store, sha1.slice(0, 2), sha1);
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha1");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function inspect(target: string): Promise<FileInfo | null> {
  const stats = await fsp.lstat(target, { bigint: true }).catch(() => null);
  if (!stats?.isFile()) return null;
  return {
    id: `${stats.dev}:${stats.ino}`,
    dev: String(stats.dev),
    size: Number(stats.size),
    links: Number(stats.nlink),
    stamp: `${stats.ino}|${stats.size}|${stats.mtimeNs}`,
  };
}

async function deviceOf(directory: string): Promise<string | null> {
  const stats = await fsp.stat(directory, { bigint: true }).catch(() => null);
  return stats ? String(stats.dev) : null;
}

function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => undefined);
  locks.set(key, settled);
  void settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return next;
}

async function trustedStoreFile(
  sha1: string,
  roots: ContentStoreRoots,
): Promise<FileInfo | null> {
  const target = storePath(sha1, roots);
  const info = await inspect(target);
  if (!info) return null;
  if (verified.get(target) === info.stamp) return info;

  if ((await hashFile(target).catch(() => "")) !== sha1) {
    verified.delete(target);
    await fs.unlink(target).catch(() => undefined);
    return null;
  }

  verified.set(target, info.stamp);
  return info;
}

async function createLink(
  source: string,
  target: string,
  device: string,
): Promise<boolean> {
  try {
    await fs.link(source, target);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code ?? "";
    if (UNSUPPORTED_LINK_ERRORS.has(code)) unsupportedDevices.add(device);
    return false;
  }
}

async function replaceWithLink(
  source: string,
  target: string,
  device: string,
): Promise<boolean> {
  const temporary = `${target}${LINK_SUFFIX}`;
  await fs.remove(temporary).catch(() => undefined);
  if (!(await createLink(source, temporary, device))) return false;
  try {
    await fs.rename(temporary, target);
    return true;
  } catch {
    await fs.remove(temporary).catch(() => undefined);
    return false;
  }
}

export async function detachHardLink(target: string): Promise<void> {
  const stats = await fs.lstat(target).catch(() => null);
  if (stats?.isFile() && stats.nlink > 1) await fs.unlink(target);
}

export async function linkFromStore(
  destination: string,
  sha1: string,
  size: number,
  roots: ContentStoreRoots = defaultStoreRoots(),
): Promise<boolean> {
  const hash = sha1.toLowerCase();
  if (!SHA1.test(hash) || !isContentFile(destination, roots)) return false;

  return withLock(hash, async () => {
    const stored = await trustedStoreFile(hash, roots).catch(() => null);
    if (!stored || (size > 0 && stored.size !== size)) return false;

    await fs.ensureDir(path.dirname(destination));
    const device = await deviceOf(path.dirname(destination));
    if (!device || unsupportedDevices.has(device)) return false;

    return replaceWithLink(storePath(hash, roots), destination, device);
  }).catch(() => false);
}

export async function adoptIntoStore(
  filePath: string,
  knownSha1?: string,
  roots: ContentStoreRoots = defaultStoreRoots(),
): Promise<number> {
  if (!isContentFile(filePath, roots)) return 0;

  const info = await inspect(filePath);
  if (!info || info.size === 0 || unsupportedDevices.has(info.dev)) return 0;

  const hash = (
    knownSha1 && SHA1.test(knownSha1.toLowerCase())
      ? knownSha1
      : await hashFile(filePath)
  ).toLowerCase();

  return withLock(hash, async () => {
    const target = storePath(hash, roots);
    const stored = await trustedStoreFile(hash, roots).catch(() => null);

    if (stored) {
      if (stored.id === info.id || stored.size !== info.size) return 0;
      const replaced = await replaceWithLink(target, filePath, info.dev);
      return replaced && info.links === 1 ? info.size : 0;
    }

    await fs.ensureDir(path.dirname(target));
    if (await createLink(filePath, target, info.dev)) {
      const linked = await inspect(target);
      if (linked) verified.set(target, linked.stamp);
    }
    return 0;
  }).catch(() => 0);
}

export async function copyContentFile(
  source: string,
  target: string,
  roots: ContentStoreRoots = defaultStoreRoots(),
): Promise<void> {
  await fs.ensureDir(path.dirname(target));
  if (isContentFile(target, roots)) {
    await adoptIntoStore(source, undefined, roots);
    const device = await deviceOf(path.dirname(target));
    if (device && !unsupportedDevices.has(device)) {
      if (await createLink(source, target, device)) return;
    }
  }
  await fs.copy(source, target);
}

async function listDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

export async function listContentFiles(
  roots: ContentStoreRoots = defaultStoreRoots(),
): Promise<string[]> {
  const files: string[] = [];
  for (const instance of await listDirs(roots.versions)) {
    const instancePath = path.join(roots.versions, instance);
    for (const folder of await listDirs(instancePath)) {
      if (!CONTENT_FOLDERS.has(folder.toLowerCase())) continue;
      const folderPath = path.join(instancePath, folder);
      const entries = await fs
        .readdir(folderPath, { withFileTypes: true })
        .catch(() => []);
      for (const entry of entries) {
        if (entry.isFile() && CONTENT_FILE.test(entry.name)) {
          files.push(path.join(folderPath, entry.name));
        }
      }
    }
  }
  return files;
}

async function listStoreFiles(roots: ContentStoreRoots): Promise<string[]> {
  const files: string[] = [];
  for (const prefix of await listDirs(roots.store)) {
    const prefixPath = path.join(roots.store, prefix);
    for (const name of await fs.readdir(prefixPath).catch(() => [])) {
      if (SHA1.test(name)) files.push(path.join(prefixPath, name));
    }
  }
  return files;
}

async function storedIds(roots: ContentStoreRoots): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const file of await listStoreFiles(roots)) {
    const info = await inspect(file);
    if (info) ids.add(info.id);
  }
  return ids;
}

export async function collectStoreGarbage(
  roots: ContentStoreRoots = defaultStoreRoots(),
): Promise<number> {
  let freed = 0;
  for (const file of await listStoreFiles(roots)) {
    await withLock(path.basename(file), async () => {
      const info = await inspect(file);
      if (!info || info.links > 1) return;
      await fs.unlink(file);
      verified.delete(file);
      freed += info.size;
    }).catch(() => undefined);
  }
  return freed;
}

export async function getContentStoreStats(
  roots: ContentStoreRoots = defaultStoreRoots(),
): Promise<ContentStoreStats> {
  const stats: ContentStoreStats = {
    saved: 0,
    potential: 0,
    duplicates: 0,
    orphans: 0,
    orphanBytes: 0,
  };

  const stored = new Set<string>();
  for (const file of await listStoreFiles(roots)) {
    const info = await inspect(file);
    if (!info) continue;
    stored.add(info.id);
    if (info.links > 2) stats.saved += info.size * (info.links - 2);
    if (info.links === 1) {
      stats.orphans++;
      stats.orphanBytes += info.size;
    }
  }

  const groups = new Map<string, { size: number; linked: boolean; loose: number }>();
  for (const file of await listContentFiles(roots)) {
    const info = await inspect(file);
    if (!info || info.size === 0) continue;
    const name = path.basename(file).replace(/\.disabled$/i, "").toLowerCase();
    const key = `${name}|${info.size}`;
    const group = groups.get(key) ?? { size: info.size, linked: false, loose: 0 };
    if (stored.has(info.id)) group.linked = true;
    else group.loose++;
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const extra = group.linked ? group.loose : Math.max(0, group.loose - 1);
    stats.duplicates += extra;
    stats.potential += extra * group.size;
  }

  return stats;
}

export async function dedupeContent(
  roots: ContentStoreRoots = defaultStoreRoots(),
  onProgress?: (progress: DedupeProgress) => void,
): Promise<DedupeResult> {
  const result: DedupeResult = { freed: 0, linked: 0, unsupported: false };
  const stored = await storedIds(roots);
  const files = await listContentFiles(roots);
  let done = 0;
  onProgress?.({ done, total: files.length });

  for (const file of files) {
    const before = await inspect(file);
    if (before && !stored.has(before.id)) {
      const freed = await adoptIntoStore(file, undefined, roots);
      const after = await inspect(file);
      if (after && after.links > 1) stored.add(after.id);
      if (freed > 0) result.linked++;
      if (unsupportedDevices.has(before.dev)) result.unsupported = true;
      result.freed += freed;
    }
    onProgress?.({ done: ++done, total: files.length });
  }

  result.freed += await collectStoreGarbage(roots);
  return result;
}

export function resetContentStoreCaches(): void {
  verified.clear();
  unsupportedDevices.clear();
}
