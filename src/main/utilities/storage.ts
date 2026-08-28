import { app, session, shell } from "electron";
import fs from "fs-extra";
import path from "path";
import type {
  StorageBreakdown,
  StorageCategory,
  StorageCleanup,
  StorageCleanupEntry,
  StorageCleanupKind,
  StorageClearResult,

} from "@/types/Storage";
import { getLauncherPaths } from "./other";
import {
  cleanupOrphanBackups,
  DISPLACED_DIR_NAME,
  getBackupsDir,
  getOrphanBackupsStats,
  getPreservedCopiesSize,
  normalizeBackupEntry,
  WorldBackupIndexError,
} from "./worldBackups";

const APP_CACHE_DIR_NAMES = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "ShaderCache",
  "Service Worker",
  "blob_storage",
];

function getAppCacheDirs(): string[] {
  const userData = app.getPath("userData");
  return APP_CACHE_DIR_NAMES.map((name) => path.join(userData, name));
}

async function dirSize(target: string, exclude?: Set<string>): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(target);
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    const full = path.join(target, entry);
    if (exclude?.has(full)) continue;

    let st: fs.Stats;
    try {
      st = await fs.lstat(full);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      total += await dirSize(full, exclude);
    } else {
      total += st.size;
    }
  }

  return total;
}

async function pathSize(target: string): Promise<number> {
  try {
    const st = await fs.lstat(target);
    return st.isDirectory() ? await dirSize(target) : st.size;
  } catch {
    return 0;
  }
}

async function sumSizes(paths: string[]): Promise<number> {
  let total = 0;
  for (const p of paths) total += await pathSize(p);
  return total;
}

async function hasInstanceConf(versionDir: string): Promise<boolean> {
  const rootConf = path.join(versionDir, "version.json");
  if (await fs.pathExists(rootConf)) return true;

  const entries = await fs.readdir(versionDir).catch(() => [] as string[]);
  for (const entry of entries) {
    if (await fs.pathExists(path.join(versionDir, entry, "version.json"))) {
      return true;
    }
  }

  return false;
}

const PLAYER_DATA_DIRS = ["saves", "server"];

async function hasPlayerData(versionDir: string): Promise<boolean> {
  for (const name of PLAYER_DATA_DIRS) {
    if (await fs.pathExists(path.join(versionDir, name))) return true;
  }

  return false;
}

async function computeOrphanInstances(versionsPath: string): Promise<{
  names: string[];
  dataNames: string[];
  paths: string[];
}> {
  const names: string[] = [];
  const dataNames: string[] = [];
  const paths: string[] = [];

  for (const name of await listVersionDirs(versionsPath)) {
    const dir = path.join(versionsPath, name);
    if (await hasInstanceConf(dir)) continue;

    names.push(name);
    paths.push(dir);
    if (await hasPlayerData(dir)) dataNames.push(name);
  }

  return { names, dataNames, paths };
}

async function listVersionDirs(versionsPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(versionsPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const dirs = getLauncherPaths();
  const rootPath = dirs.launcher;

  const assetsPath = path.join(dirs.minecraft, "assets");
  const librariesPath = path.join(dirs.minecraft, "libraries");
  const versionsPath = path.join(dirs.minecraft, "versions");

  const versionDirs = await listVersionDirs(versionsPath);
  const backupsPath = getBackupsDir();

  const [
    versions,
    assets,
    libraries,
    java,
    backupsDirSize,
    preservedSize,
    userDataCaches,
    other,
    cleanup,
  ] = await Promise.all([
    Promise.all(
      versionDirs.map(async (name) => ({
        name,
        size: await dirSize(
          path.join(versionsPath, name),
          new Set([
            path.join(versionsPath, name, "saves", DISPLACED_DIR_NAME),
            path.join(versionsPath, name, "temp"),
          ]),
        ),
      })),
    ),
    dirSize(assetsPath),
    dirSize(librariesPath),
    dirSize(dirs.java),
    dirSize(backupsPath),
    getPreservedCopiesSize(),
    sumSizes(getAppCacheDirs()),
    dirSize(
      rootPath,
      new Set([
        assetsPath,
        librariesPath,
        versionsPath,
        dirs.java,
        backupsPath,
        dirs.cache,
      ]),
    ),
    computeCleanup(versionsPath, librariesPath, dirs.java),
  ]);

  versions.sort((a, b) => b.size - a.size);
  const versionsTotal = versions.reduce((sum, entry) => sum + entry.size, 0);
  const backups = backupsDirSize + preservedSize;

  const [cacheSize, versionTempsSize] = await Promise.all([
    dirSize(dirs.cache),
    sumSizes(versionDirs.map((n) => path.join(versionsPath, n, "temp"))),
  ]);
  const appData = userDataCaches + cacheSize + versionTempsSize;
  const reclaimable = appData;

  const categories: StorageCategory[] = [
    { id: "versions", size: versionsTotal },
    { id: "libraries", size: libraries },
    { id: "assets", size: assets },
    { id: "java", size: java },
    { id: "backups", size: backups },
    { id: "appData", size: appData },
    { id: "other", size: other },
  ];

  return {
    total:
      versionsTotal + libraries + assets + java + backups + appData + other,
    rootPath,
    categories,
    versions,
    reclaimable,
    cleanup,
    computedAt: Date.now(),
  };
}

export async function clearCaches(): Promise<StorageClearResult> {
  const dirs = getLauncherPaths();
  const versionsPath = path.join(dirs.minecraft, "versions");
  const legacyTemp = path.join(app.getPath("temp"), "grubie-mod-meta");

  const versionDirs = await listVersionDirs(versionsPath);
  const versionTemps = versionDirs.map((n) =>
    path.join(versionsPath, n, "temp"),
  );

  const reclaimPaths = [
    ...getAppCacheDirs(),
    dirs.cache,
    ...versionTemps,
    legacyTemp,
  ];
  const before = await sumSizes(reclaimPaths);

  await fs.remove(dirs.cache).catch(() => {});
  await fs.remove(legacyTemp).catch(() => {});
  for (const temp of versionTemps) await fs.remove(temp).catch(() => {});

  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearCodeCaches({});
    await session.defaultSession.clearStorageData({
      storages: ["cachestorage", "shadercache", "serviceworkers"],
    });
  } catch {}

  const after = await sumSizes(reclaimPaths);
  return { freed: Math.max(0, before - after) };
}


interface ManifestScan {
  majors: Set<number>;
  inUseLibs: Set<string>;
  versionCount: number;
  allParsed: boolean;
  majorsComplete: boolean;
}

function normLib(relPath: string): string {
  return relPath.replace(/\\/g, "/").toLowerCase();
}

export function mavenToRelPath(name: string): string | null {
  const [coords, ext = "jar"] = name.split("@");
  const parts = coords.split(":");
  if (parts.length < 3) return null;
  const [group, artifact, version, classifier] = parts;
  const file = classifier
    ? `${artifact}-${version}-${classifier}.${ext}`
    : `${artifact}-${version}.${ext}`;
  return [...group.split("."), artifact, version, file].join("/");
}

async function scanManifests(versionsPath: string): Promise<ManifestScan> {
  const dirs = await listVersionDirs(versionsPath);
  const majors = new Set<number>();
  const inUseLibs = new Set<string>();
  let allParsed = true;
  let majorsComplete = true;

  for (const name of dirs) {
    const dir = path.join(versionsPath, name);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      allParsed = false;
      majorsComplete = false;
      continue;
    }

    let foundManifest = false;
    for (const file of files) {
      if (!file.toLowerCase().endsWith(".json")) continue;

      let data: any;
      try {
        data = await fs.readJSON(path.join(dir, file));
      } catch {
        majorsComplete = false;
        continue;
      }

      if (typeof data?.javaVersion?.majorVersion === "number") {
        majors.add(data.javaVersion.majorVersion);
      }

      if (Array.isArray(data?.libraries)) {
        foundManifest = true;
        for (const lib of data.libraries) {
          const artifactPath = lib?.downloads?.artifact?.path;
          if (typeof artifactPath === "string")
            inUseLibs.add(normLib(artifactPath));
          if (typeof lib?.name === "string") {
            const maven = mavenToRelPath(lib.name);
            if (maven) inUseLibs.add(normLib(maven));
          }
        }
      }
    }

    if (!foundManifest) allParsed = false;
  }

  return {
    majors,
    inUseLibs,
    versionCount: dirs.length,
    allParsed,
    majorsComplete,
  };
}

async function assertBackupIndexIsSound(): Promise<void> {
  const indexPath = path.join(getBackupsDir(), "index.json");

  let stored: unknown;
  try {
    stored = await fs.readJSON(indexPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return;
    throw new WorldBackupIndexError(error);
  }

  if (!Array.isArray(stored)) {
    throw new WorldBackupIndexError(new Error("index is not a list"));
  }

  if (stored.some((value) => !normalizeBackupEntry(value))) {
    throw new WorldBackupIndexError(new Error("index has damaged records"));
  }
}

async function offerableOrphanBackups(): Promise<StorageCleanupEntry> {
  try {
    await assertBackupIndexIsSound();
    return await getOrphanBackupsStats();
  } catch (error) {
    console.error(
      `[storage] the world backup index cannot be trusted, no backup cleanup is offered:`,
      error,
    );
    return { count: 0, size: 0 };
  }
}

export function majorFromJavaDir(dirName: string): number | null {
  if (/^jdk8u/i.test(dirName)) return 8;
  const match = /^jdk-(\d+)/i.exec(dirName);
  return match ? Number(match[1]) : null;
}

async function computeUnusedJava(
  javaDir: string,
  requiredMajors: Set<number>,
  hasVersions: boolean,
): Promise<string[]> {
  if (!hasVersions) return [];

  let names: string[];
  try {
    names = await fs.readdir(javaDir);
  } catch {
    return [];
  }

  const byMajor = new Map<number, { path: string; mtime: number }[]>();
  for (const name of names) {
    if (name === "cache") continue;
    const major = majorFromJavaDir(name);
    if (major == null) continue;

    const full = path.join(javaDir, name);
    try {
      const st = await fs.stat(full);
      if (!st.isDirectory()) continue;
      if (!byMajor.has(major)) byMajor.set(major, []);
      byMajor.get(major)!.push({ path: full, mtime: st.mtimeMs });
    } catch {
      continue;
    }
  }

  const toDelete: string[] = [];
  for (const [major, group] of byMajor) {
    if (!requiredMajors.has(major)) {
      for (const e of group) toDelete.push(e.path);
    } else {
      group.sort((a, b) => b.mtime - a.mtime);
      for (const e of group.slice(1)) toDelete.push(e.path);
    }
  }
  return toDelete;
}

async function listFilesRecursive(root: string, out: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry);
    let st: fs.Stats;
    try {
      st = await fs.lstat(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) await listFilesRecursive(full, out);
    else out.push(full);
  }
}

async function computeOrphanLibraries(
  librariesPath: string,
  scan: ManifestScan,
): Promise<string[]> {
  if (!scan.allParsed || scan.versionCount === 0) return [];

  const files: string[] = [];
  await listFilesRecursive(librariesPath, files);

  const orphans: string[] = [];
  for (const file of files) {
    const rel = normLib(path.relative(librariesPath, file));
    if (!scan.inUseLibs.has(rel)) orphans.push(file);
  }
  return orphans;
}

export async function computeCleanup(
  versionsPath: string,
  librariesPath: string,
  javaDir: string,
): Promise<StorageCleanup> {
  const scan = await scanManifests(versionsPath);
  const hasVersions = scan.versionCount > 0;

  const unusedJava = await computeUnusedJava(
    javaDir,
    scan.majors,
    hasVersions && scan.majorsComplete,
  );
  const orphanLibs = await computeOrphanLibraries(librariesPath, scan);
  const orphanBackups = hasVersions
    ? await offerableOrphanBackups()
    : { count: 0, size: 0 };

  const orphanInstances = await computeOrphanInstances(versionsPath);

  return {
    java: { count: unusedJava.length, size: await sumSizes(unusedJava) },
    libraries: {
      count: orphanLibs.length,
      size: await sumSizes(orphanLibs),
      safe: scan.allParsed && hasVersions,
    },
    backups: orphanBackups,
    instances: {
      count: orphanInstances.names.length,
      size: await sumSizes(orphanInstances.paths),
      names: orphanInstances.names,
      dataNames: orphanInstances.dataNames,
    },
  };
}

export async function cleanupStorage(
  kind: StorageCleanupKind,
  names?: string[],
): Promise<StorageClearResult> {
  if (kind === "backups") {
    await assertBackupIndexIsSound();
    const { size } = await cleanupOrphanBackups();
    return { freed: size };
  }

  const dirs = getLauncherPaths();
  const versionsPath = path.join(dirs.minecraft, "versions");
  const librariesPath = path.join(dirs.minecraft, "libraries");

  if (kind === "instances") {
    const orphans = await computeOrphanInstances(versionsPath);
    const confirmed = names ? new Set(names) : null;

    const entries = orphans.names
      .map((name, index) => ({ name, path: orphans.paths[index] }))
      .filter((entry) => !confirmed || confirmed.has(entry.name));

    const targets = entries.map((entry) => entry.path);
    const before = await sumSizes(targets);
    const kept: string[] = [];

    for (const entry of entries) {
      try {
        await shell.trashItem(entry.path);
      } catch {
        kept.push(entry.name);
      }
    }

    const after = await sumSizes(targets);

    return { freed: Math.max(0, before - after), kept };
  }

  const scan = await scanManifests(versionsPath);

  const targets =
    kind === "java"
      ? await computeUnusedJava(
          dirs.java,
          scan.majors,
          scan.versionCount > 0 && scan.majorsComplete,
        )
      : await computeOrphanLibraries(librariesPath, scan);

  const before = await sumSizes(targets);
  for (const target of targets) await fs.remove(target).catch(() => {});
  const after = await sumSizes(targets);

  return { freed: Math.max(0, before - after) };
}
