import path from "path";
import fs from "fs-extra";
import pLimit from "p-limit";
import type { ImportPart } from "@/types/LauncherImport";
import type { ForeignInstance } from "./common";

const PART_FOLDERS: Record<string, ImportPart> = {
  mods: "mods",
  coremods: "mods",
  saves: "worlds",
  screenshots: "screenshots",
  resourcepacks: "packs",
  shaderpacks: "packs",
  texturepacks: "packs",
};

const NEVER_COPY = new Set([
  "logs",
  "crash-reports",
  "natives",
  "temp",
  "tmp",
  "downloads",
  ".fabric",
  ".quilt",
  ".mixin.out",
  ".cache",
  "cache",
  "libraries",
  "versions",
  "assets",
  "bin",
  "runtime",
  "jre",
  "webcache",
  "webcache2",
  "debug",
  "server-resource-packs",
  ".tlauncher",
  ".grubielauncher",
  ".minecraft",
  "minecraft",
  "usercache.json",
  "usernamecache.json",
  "tlauncherprofiles.json",
  "tlauncher_profiles.json",
  "realms_persistence.json",
  "command_history.txt",
  "treatment_tags.json",
  "mmc-pack.json",
  "instance.cfg",
  "patches",
  "jarmods",
  "$recycle.bin",
  "system volume information",
  "desktop.ini",
  "thumbs.db",
  ".ds_store",
]);

const NEVER_COPY_PATTERNS = [/^launcher_/i, /^tlauncher/i, /\.log(?:\.\d+)?$/i, /^hs_err_pid/i, /\.lck$/i];

const NEVER_COPY_FILES = new Set(["session.lock"]);

export interface CopyItem {
  source: string;
  target: string;
  size: number;
  mtime: Date;
}

export function partOfEntry(name: string, instance: Pick<ForeignInstance, "sharedGameDir" | "skipEntries">): ImportPart | null {
  const lower = name.toLowerCase();
  if (instance.skipEntries?.some((entry) => entry.toLowerCase() === lower)) return null;
  if (PART_FOLDERS[lower]) return PART_FOLDERS[lower];
  if (NEVER_COPY.has(lower)) return null;
  if (NEVER_COPY_PATTERNS.some((pattern) => pattern.test(name))) return null;
  if (instance.sharedGameDir && lower === "home") return null;
  return "configs";
}

async function statFollow(target: string) {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

async function walk(
  source: string,
  target: string,
  items: CopyItem[],
  skip: (relative: string) => boolean,
  relative = "",
): Promise<void> {
  const entries = await fs
    .readdir(source, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  for (const entry of entries) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (skip(childRelative)) continue;
    const childSource = path.join(source, entry.name);
    const childTarget = path.join(target, entry.name);

    if (entry.isSymbolicLink()) {
      const stat = await statFollow(childSource);
      if (stat?.isFile()) {
        items.push({ source: childSource, target: childTarget, size: stat.size, mtime: stat.mtime });
      }
      continue;
    }

    if (entry.isDirectory()) {
      await walk(childSource, childTarget, items, skip, childRelative);
      continue;
    }

    if (!entry.isFile() || NEVER_COPY_FILES.has(entry.name.toLowerCase())) continue;
    const stat = await statFollow(childSource);
    if (stat) {
      items.push({ source: childSource, target: childTarget, size: stat.size, mtime: stat.mtime });
    }
  }
}

function disabledName(name: string): string {
  return name.toLowerCase().endsWith(".disabled") ? name : `${name}.disabled`;
}

export async function collectCopyItems(
  instance: ForeignInstance,
  parts: ReadonlySet<ImportPart>,
): Promise<CopyItem[]> {
  const items: CopyItem[] = [];
  const entries = await fs
    .readdir(instance.gameDir, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  for (const entry of entries) {
    const part = partOfEntry(entry.name, instance);
    if (!part || !parts.has(part)) continue;
    if (part === "mods" && instance.skipMods) continue;

    const source = path.join(instance.gameDir, entry.name);
    const stat = entry.isSymbolicLink() ? await statFollow(source) : null;
    const isDir = entry.isDirectory() || !!stat?.isDirectory();
    const isFile = entry.isFile() || !!stat?.isFile();

    if (isDir && !entry.isSymbolicLink()) {
      const lower = entry.name.toLowerCase();
      await walk(source, entry.name, items, (relative) =>
        lower === "mods" && relative.toLowerCase() === ".index",
      );
    } else if (isFile && !NEVER_COPY_FILES.has(entry.name.toLowerCase())) {
      const fileStat = stat ?? (await statFollow(source));
      if (fileStat) {
        items.push({ source, target: entry.name, size: fileStat.size, mtime: fileStat.mtime });
      }
    }
  }

  if (parts.has("mods") && !instance.skipMods && instance.disabledModsDir) {
    const disabled = await fs
      .readdir(instance.disabledModsDir, { withFileTypes: true })
      .catch(() => [] as fs.Dirent[]);
    for (const entry of disabled) {
      if (!entry.isFile()) continue;
      const source = path.join(instance.disabledModsDir, entry.name);
      const stat = await statFollow(source);
      if (stat) {
        items.push({
          source,
          target: path.join("mods", disabledName(entry.name)),
          size: stat.size,
          mtime: stat.mtime,
        });
      }
    }
  }

  return items;
}

export function totalBytes(items: CopyItem[]): number {
  return items.reduce((sum, item) => sum + item.size, 0);
}

export interface CopyResult {
  copied: number;
  skipped: number;
  failed: string[];
}

export async function copyItems(
  items: CopyItem[],
  destination: string,
  onProgress?: (processedBytes: number, totalBytes: number) => void,
): Promise<CopyResult> {
  const total = totalBytes(items);
  const limit = pLimit(4);
  const result: CopyResult = { copied: 0, skipped: 0, failed: [] };
  const root = path.resolve(destination);
  let processed = 0;

  await Promise.all(
    items.map((item) =>
      limit(async () => {
        const target = path.resolve(root, item.target);
        const back = path.relative(root, target);
        if (!back || back.startsWith("..") || path.isAbsolute(back)) {
          result.failed.push(item.target);
          return;
        }

        try {
          if (await fs.pathExists(target)) {
            result.skipped++;
          } else {
            await fs.ensureDir(path.dirname(target));
            await fs.copyFile(item.source, target, fs.constants.COPYFILE_FICLONE);
            await fs.utimes(target, item.mtime, item.mtime).catch(() => undefined);
            result.copied++;
          }
        } catch {
          result.failed.push(item.target);
        }

        processed += item.size;
        onProgress?.(processed, total);
      }),
    ),
  );

  return result;
}
