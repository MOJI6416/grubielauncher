import path from "path";
import fs from "fs-extra";
import type { IVersionConf } from "@/types/IVersion";
import type { IModpackExtraFile } from "@/types/ModManager";
import type {
  ModpackApplyResult,
  ModpackBase,
  ModpackBaseInput,
  ModpackFileMap,
  ModpackFileSide,
  ModpackFileTarget,
  ModpackFilesPlan,
  ModpackRollback,
  ModpackRollbackInfo,
} from "@/types/ModpackSource";
import {
  isContentPath,
  normalizePackPath,
  planModpackFiles,
} from "@/shared/modpackMerge";
import { getSha1 } from "../utilities/files";
import { writeJsonAtomic } from "../utilities/atomicJson";

const BASE_FILE = "base.json";
const ROLLBACK_DIR = "rollback";
const SNAPSHOT_FILE = "snapshot.json";

type FileSource = { file: string } | { url: string };

interface PackFiles {
  hashes: Record<ModpackFileSide, ModpackFileMap>;
  sources: Record<ModpackFileSide, Record<string, FileSource>>;
}

interface RollbackSnapshot {
  conf: IVersionConf;
  base: ModpackBase | null;
  backedUp: ModpackFileTarget[];
  created: ModpackFileTarget[];
  fromVersion: string;
  toVersion: string;
  createdAt: string;
}

export function modpackStoragePath(versionPath: string): string {
  return path.join(versionPath, "storage", "modpack");
}

function rollbackPath(versionPath: string): string {
  return path.join(modpackStoragePath(versionPath), ROLLBACK_DIR);
}

function sideRoot(versionPath: string, side: ModpackFileSide): string {
  return side === "client"
    ? versionPath
    : path.join(versionPath, "storage", "server-overrides");
}

function safeJoin(root: string, relative: string): string | null {
  const normalized = normalizePackPath(relative);
  if (!normalized) return null;

  const target = path.resolve(root, ...normalized.split("/"));
  const base = path.resolve(root);
  if (target !== base && !target.startsWith(base + path.sep)) return null;

  return target;
}

async function walk(root: string, relative = ""): Promise<string[]> {
  const entries = await fs
    .readdir(path.join(root, relative), { withFileTypes: true })
    .catch(() => []);
  const result: string[] = [];

  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!relative && isContentPath(child)) continue;
      result.push(...(await walk(root, child)));
    } else if (entry.isFile()) {
      if (isContentPath(child)) continue;
      result.push(child);
    }
  }

  return result;
}

async function hashFolder(
  root: string,
  into: { hashes: ModpackFileMap; sources: Record<string, FileSource> },
): Promise<void> {
  if (!(await fs.pathExists(root))) return;

  for (const relative of await walk(root)) {
    const file = path.join(root, ...relative.split("/"));
    const sha1 = await getSha1(file).catch(() => null);
    if (!sha1) continue;

    into.hashes[relative] = sha1;
    into.sources[relative] = { file };
  }
}

async function readPackFiles(
  root: string,
  extraFiles: IModpackExtraFile[],
): Promise<PackFiles> {
  const files: PackFiles = {
    hashes: { client: {}, server: {} },
    sources: { client: {}, server: {} },
  };
  const client = { hashes: files.hashes.client, sources: files.sources.client };
  const server = { hashes: files.hashes.server, sources: files.sources.server };

  await hashFolder(path.join(root, "overrides"), client);
  await hashFolder(path.join(root, "client-overrides"), client);
  await hashFolder(path.join(root, "server-overrides"), server);

  for (const extra of extraFiles) {
    const relative = normalizePackPath(extra.path);
    if (!relative || isContentPath(relative) || !extra.sha1) continue;

    const sha1 = extra.sha1.toLowerCase();
    if (extra.isClient) {
      files.hashes.client[relative] = sha1;
      files.sources.client[relative] = { url: extra.url };
    }
    if (extra.isServer) {
      files.hashes.server[relative] = sha1;
      files.sources.server[relative] = { url: extra.url };
    }
  }

  return files;
}

function isBase(value: unknown): value is ModpackBase {
  if (!value || typeof value !== "object") return false;
  const base = value as ModpackBase;
  return (
    typeof base.versionId === "string" &&
    Array.isArray(base.projects) &&
    !!base.client &&
    typeof base.client === "object" &&
    !!base.server &&
    typeof base.server === "object"
  );
}

export async function readModpackBase(
  versionPath: string,
): Promise<ModpackBase | null> {
  const value = await fs
    .readJSON(path.join(modpackStoragePath(versionPath), BASE_FILE))
    .catch(() => null);

  return isBase(value) ? value : null;
}

export async function writeModpackBase(
  versionPath: string,
  root: string,
  input: ModpackBaseInput,
): Promise<void> {
  const files = await readPackFiles(root, input.extraFiles);
  const base: ModpackBase = {
    versionId: input.versionId,
    loaderVersion: input.loaderVersion,
    projects: input.projects,
    client: files.hashes.client,
    server: files.hashes.server,
  };

  await fs.ensureDir(modpackStoragePath(versionPath));
  await writeJsonAtomic(
    path.join(modpackStoragePath(versionPath), BASE_FILE),
    base,
  );
}

async function currentHashes(
  versionPath: string,
  side: ModpackFileSide,
  paths: string[],
): Promise<Record<string, string | null>> {
  const root = sideRoot(versionPath, side);
  const result: Record<string, string | null> = {};

  for (const relative of paths) {
    const target = safeJoin(root, relative);
    result[relative] = target
      ? await getSha1(target).catch(() => null)
      : null;
  }

  return result;
}

export async function planModpackUpdateFiles(
  versionPath: string,
  root: string,
  extraFiles: IModpackExtraFile[],
): Promise<ModpackFilesPlan | null> {
  const base = await readModpackBase(versionPath);
  if (!base) return null;

  const next = await readPackFiles(root, extraFiles);
  const current: Record<ModpackFileSide, Record<string, string | null>> = {
    client: {},
    server: {},
  };

  for (const side of ["client", "server"] as const) {
    const paths = [
      ...new Set([
        ...Object.keys(base[side]),
        ...Object.keys(next.hashes[side]),
      ]),
    ];
    current[side] = await currentHashes(versionPath, side, paths);
  }

  return planModpackFiles({ base, next: next.hashes, current });
}

export async function applyModpackUpdateFiles(input: {
  versionPath: string;
  root: string;
  extraFiles: IModpackExtraFile[];
  plan: Pick<ModpackFilesPlan, "write" | "remove">;
  preserve?: string[];
  previousConf: IVersionConf;
  toVersion: string;
}): Promise<ModpackApplyResult> {
  const { versionPath, root } = input;
  const next = await readPackFiles(root, input.extraFiles);
  const snapshotRoot = rollbackPath(versionPath);

  await fs.remove(snapshotRoot);
  await fs.ensureDir(snapshotRoot);

  const snapshot: RollbackSnapshot = {
    conf: input.previousConf,
    base: await readModpackBase(versionPath),
    backedUp: [],
    created: [],
    fromVersion: input.previousConf.modpack?.versionNumber ?? "",
    toVersion: input.toVersion,
    createdAt: new Date().toISOString(),
  };

  const backup = async (item: ModpackFileTarget, target: string) => {
    const copy = safeJoin(path.join(snapshotRoot, "files", item.side), item.path);
    if (!copy) return;

    await fs.copy(target, copy, { overwrite: true });
    snapshot.backedUp.push(item);
  };

  const downloads: ModpackApplyResult["downloads"] = [];

  try {
    for (const relative of input.preserve ?? []) {
      const item: ModpackFileTarget = { side: "client", path: relative };
      const target = safeJoin(versionPath, relative);
      if (!target || !isContentPath(relative)) continue;
      if (await fs.pathExists(target)) await backup(item, target);
    }

    for (const item of input.plan.write) {
      const target = safeJoin(sideRoot(versionPath, item.side), item.path);
      const source = next.sources[item.side][normalizePackPath(item.path)];
      if (!target || !source) continue;

      if (await fs.pathExists(target)) await backup(item, target);
      else snapshot.created.push(item);

      if ("file" in source) {
        await fs.copy(source.file, target, { overwrite: true });
      } else {
        downloads.push({ url: source.url, destination: target });
      }
    }

    for (const item of input.plan.remove) {
      const target = safeJoin(sideRoot(versionPath, item.side), item.path);
      if (!target || !(await fs.pathExists(target))) continue;

      await backup(item, target);
      await fs.remove(target);
    }

    await writeJsonAtomic(path.join(snapshotRoot, SNAPSHOT_FILE), snapshot);
  } catch (error) {
    await undoSnapshot(versionPath, snapshot).catch(() => undefined);
    await fs.remove(snapshotRoot).catch(() => undefined);
    throw error;
  }

  return { downloads };
}

async function undoSnapshot(
  versionPath: string,
  snapshot: Pick<RollbackSnapshot, "created" | "backedUp">,
): Promise<void> {
  const snapshotRoot = rollbackPath(versionPath);

  for (const item of snapshot.created) {
    const target = safeJoin(sideRoot(versionPath, item.side), item.path);
    if (target) await fs.remove(target);
  }

  for (const item of snapshot.backedUp) {
    const copy = safeJoin(path.join(snapshotRoot, "files", item.side), item.path);
    const target = safeJoin(sideRoot(versionPath, item.side), item.path);
    if (!copy || !target || !(await fs.pathExists(copy))) continue;

    await fs.copy(copy, target, { overwrite: true });
  }
}

async function readSnapshot(
  versionPath: string,
): Promise<RollbackSnapshot | null> {
  const value = await fs
    .readJSON(path.join(rollbackPath(versionPath), SNAPSHOT_FILE))
    .catch(() => null);

  if (!value || typeof value !== "object" || !value.conf) return null;
  return value as RollbackSnapshot;
}

export async function readModpackRollback(
  versionPath: string,
): Promise<ModpackRollbackInfo | null> {
  const snapshot = await readSnapshot(versionPath);
  if (!snapshot) return null;

  return {
    fromVersion: snapshot.fromVersion,
    toVersion: snapshot.toVersion,
    createdAt: snapshot.createdAt,
  };
}

export async function restoreModpackRollback(
  versionPath: string,
): Promise<ModpackRollback | null> {
  const snapshot = await readSnapshot(versionPath);
  if (!snapshot) return null;

  await undoSnapshot(versionPath, snapshot);

  const basePath = path.join(modpackStoragePath(versionPath), BASE_FILE);
  if (snapshot.base) await writeJsonAtomic(basePath, snapshot.base);

  return { conf: snapshot.conf };
}

export async function dropModpackRollback(versionPath: string): Promise<void> {
  await fs.remove(rollbackPath(versionPath));
}
