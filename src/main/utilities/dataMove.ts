import fs from "fs-extra";
import { createReadStream, createWriteStream, type Stats } from "fs";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import type {
  DataLocationPlan,
  DataMoveFailure,
  DataTargetProblem,
} from "@/types/DataLocation";
import { getFreeBytes, hasRoomFor } from "./diskSpace";
import { isInsidePath, isSamePath, overlapsPath } from "./dataRoot";

export const DATA_SUBFOLDER = "GrubieLauncher";
export const MOVE_MARKER = ".grubie-move-incomplete";
export const MOVED_MARKER = ".grubie-moved";

const MARKERS = new Set([MOVE_MARKER, MOVED_MARKER]);
const COPY_CONCURRENCY = 8;
const STREAM_THRESHOLD = 32 * 1024 * 1024;

export class DataMoveError extends Error {
  constructor(
    readonly reason: DataMoveFailure,
    readonly detail: string | null = null,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "DataMoveError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortError(): Error {
  const error = new Error("The data move was cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function statOrNull(target: string): Promise<Stats | null> {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  return (await statOrNull(target))?.isDirectory() === true;
}

async function isFile(target: string): Promise<boolean> {
  return (await statOrNull(target))?.isFile() === true;
}

async function hasDataFiles(dir: string): Promise<boolean> {
  return (
    (await isFile(path.join(dir, "settings.json"))) ||
    (await isDirectory(path.join(dir, "minecraft", "versions")))
  );
}

export async function looksLikeDataRoot(dir: string): Promise<boolean> {
  if (!(await isDirectory(dir))) return false;
  if (await fs.pathExists(path.join(dir, MOVE_MARKER))) return false;
  if (await fs.pathExists(path.join(dir, MOVED_MARKER))) return false;
  return hasDataFiles(dir);
}

async function isUsableMoveTarget(dir: string): Promise<boolean> {
  const stat = await statOrNull(dir);
  if (!stat) return true;
  if (!stat.isDirectory()) return false;

  try {
    const entries = await fs.readdir(dir);
    return entries.length === 0 || entries.includes(MOVE_MARKER);
  } catch {
    return false;
  }
}

async function nearestExistingDir(target: string): Promise<string> {
  let current = path.resolve(target);
  while (!(await isDirectory(current))) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

async function canWriteTo(dir: string): Promise<boolean> {
  const probe = path.join(
    dir,
    `.grubie-write-probe-${process.pid}-${Date.now().toString(36)}`,
  );
  try {
    await fs.writeFile(probe, "");
    await fs.remove(probe);
    return true;
  } catch {
    return false;
  }
}

function isFilesystemRoot(target: string): boolean {
  return path.parse(target).root === target;
}

interface TreeEntry {
  relative: string;
  kind: "dir" | "file" | "link";
  size: number;
  atime: Date;
  mtime: Date;
}

export async function scanTree(
  root: string,
  signal?: AbortSignal,
): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];
  const pending = [""];

  while (pending.length > 0) {
    throwIfAborted(signal);
    const relativeDir = pending.pop() as string;
    const children = await fs.readdir(path.join(root, relativeDir), {
      withFileTypes: true,
    });

    for (const child of children) {
      if (relativeDir === "" && MARKERS.has(child.name)) continue;
      const relative = path.join(relativeDir, child.name);

      if (child.isDirectory()) {
        entries.push({
          relative,
          kind: "dir",
          size: 0,
          atime: new Date(0),
          mtime: new Date(0),
        });
        pending.push(relative);
        continue;
      }

      if (!child.isFile() && !child.isSymbolicLink()) continue;

      const stat = await fs.lstat(path.join(root, relative));
      entries.push({
        relative,
        kind: stat.isSymbolicLink() ? "link" : "file",
        size: stat.isSymbolicLink() ? 0 : stat.size,
        atime: stat.atime,
        mtime: stat.mtime,
      });
    }
  }

  return entries;
}

export async function measureTree(root: string): Promise<number> {
  try {
    const entries = await scanTree(root);
    return entries.reduce((sum, entry) => sum + entry.size, 0);
  } catch {
    return 0;
  }
}

export interface PlanDataTargetOptions {
  chosen: string;
  current: string;
  exact?: boolean;
  adoptOnly?: boolean;
  protectedRoots: string[];
  cleanup: string[];
}

export async function planDataTarget(
  options: PlanDataTargetOptions,
): Promise<DataLocationPlan> {
  const chosen = path.resolve(options.chosen);
  const candidates = options.exact
    ? [chosen]
    : isFilesystemRoot(chosen)
      ? [path.join(chosen, DATA_SUBFOLDER)]
      : [chosen, path.join(chosen, DATA_SUBFOLDER)];

  const blocked = (target: string): DataTargetProblem | null => {
    if (isSamePath(target, options.current)) return "same";
    if (overlapsPath(target, options.current)) return "nested";
    if (
      options.protectedRoots.some(
        (root) => isSamePath(target, root) || isInsidePath(target, root),
      )
    ) {
      return "protected";
    }
    if (options.cleanup.some((entry) => overlapsPath(entry, target))) {
      return "cleanupPending";
    }
    return null;
  };

  for (const candidate of candidates) {
    if (!(await looksLikeDataRoot(candidate))) continue;
    const problem = blocked(candidate);
    return problem
      ? { kind: "error", problem, target: candidate }
      : { kind: "adopt", target: candidate };
  }

  if (options.adoptOnly) {
    return { kind: "error", problem: "noData", target: candidates[0] };
  }

  let target: string | null = null;
  for (const candidate of candidates) {
    if (await isUsableMoveTarget(candidate)) {
      target = candidate;
      break;
    }
  }

  if (!target) {
    return {
      kind: "error",
      problem: "notEmpty",
      target: candidates[candidates.length - 1],
    };
  }

  const problem = blocked(target);
  if (problem) return { kind: "error", problem, target };

  const anchor = await nearestExistingDir(target);
  if (!(await canWriteTo(anchor))) {
    return { kind: "error", problem: "readOnly", target };
  }

  const [bytes, currentStat, anchorStat, freeBytes] = await Promise.all([
    measureTree(options.current),
    statOrNull(options.current),
    statOrNull(anchor),
    getFreeBytes(anchor),
  ]);
  const sameVolume =
    !!currentStat && !!anchorStat && currentStat.dev === anchorStat.dev;

  if (!sameVolume && !hasRoomFor(freeBytes, bytes)) {
    return { kind: "error", problem: "space", target, bytes, freeBytes };
  }

  return { kind: "move", target, bytes, freeBytes, sameVolume };
}

export interface DataMoveProgress {
  phase: "scan" | "copy";
  copiedBytes: number;
  totalBytes: number;
}

export interface DataMoveOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DataMoveProgress) => void;
}

async function tryRename(
  from: string,
  to: string,
  existed: boolean,
): Promise<boolean> {
  if (existed && (await fs.readdir(to)).length > 0) return false;

  try {
    if (existed) await fs.rmdir(to);
    else await fs.ensureDir(path.dirname(to));
    await fs.rename(from, to);
    return true;
  } catch {
    if (existed) await fs.ensureDir(to).catch(() => undefined);
    return false;
  }
}

async function copyLink(
  from: string,
  to: string,
  source: string,
  target: string,
): Promise<void> {
  const link = await fs.readlink(source);
  const rebased =
    path.isAbsolute(link) &&
    (isSamePath(link, from) || isInsidePath(link, from))
      ? path.join(to, path.relative(from, link))
      : link;
  const resolved = await statOrNull(source);
  const type = resolved?.isDirectory()
    ? process.platform === "win32"
      ? "junction"
      : "dir"
    : "file";

  try {
    await fs.symlink(rebased, target, type);
  } catch (error) {
    if (!resolved?.isFile()) throw error;
    await fs.copyFile(source, target);
  }
}

async function copyFileEntry(
  source: string,
  target: string,
  entry: TreeEntry,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
): Promise<void> {
  if (entry.size >= STREAM_THRESHOLD) {
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        onBytes(chunk.length);
        callback(null, chunk);
      },
    });
    await pipeline(
      createReadStream(source),
      counter,
      createWriteStream(target),
      { signal },
    );
  } else {
    await fs.copyFile(source, target);
    onBytes(entry.size);
  }

  await fs.utimes(target, entry.atime, entry.mtime);
  const copied = await fs.stat(target);
  if (copied.size !== entry.size) {
    throw new DataMoveError("verify", entry.relative);
  }
}

function toMoveError(error: unknown): Error {
  if (error instanceof DataMoveError || isAbortError(error)) {
    return error as Error;
  }

  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "ENOSPC") return new DataMoveError("space");
  return new DataMoveError(
    "io",
    error instanceof Error ? error.message : String(error),
  );
}

async function discardPartialCopy(to: string, existed: boolean): Promise<void> {
  try {
    if (existed) await fs.emptyDir(to);
    else await fs.remove(to);
  } catch (error) {
    console.warn("[DataMove] Could not remove the partial copy:", error);
  }
}

export async function moveDataRoot(
  from: string,
  to: string,
  options: DataMoveOptions = {},
): Promise<"renamed" | "copied"> {
  if (overlapsPath(from, to)) throw new DataMoveError("io", to);
  if (!(await isDirectory(from))) {
    throw new DataMoveError("sourceMissing", from);
  }
  if (!(await isUsableMoveTarget(to))) {
    throw new DataMoveError("notEmpty", to);
  }

  const existed = await isDirectory(to);
  throwIfAborted(options.signal);
  if (await tryRename(from, to, existed)) return "renamed";

  const local = new AbortController();
  const forwardAbort = () => local.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    await fs.ensureDir(to);
    await fs.emptyDir(to);
    await fs.writeFile(
      path.join(to, MOVE_MARKER),
      JSON.stringify({ from, startedAt: Date.now() }),
    );

    options.onProgress?.({ phase: "scan", copiedBytes: 0, totalBytes: 0 });
    const entries = await scanTree(from, local.signal);
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    let copiedBytes = 0;
    const report = () =>
      options.onProgress?.({ phase: "copy", copiedBytes, totalBytes });
    report();

    for (const entry of entries) {
      if (entry.kind === "dir") {
        await fs.mkdir(path.join(to, entry.relative), { recursive: true });
      }
    }

    const files = entries.filter((entry) => entry.kind !== "dir");
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        throwIfAborted(local.signal);
        const entry = files[next++];
        const source = path.join(from, entry.relative);
        const target = path.join(to, entry.relative);

        try {
          if (entry.kind === "link") {
            await copyLink(from, to, source, target);
          } else {
            await copyFileEntry(
              source,
              target,
              entry,
              local.signal,
              (bytes) => {
                copiedBytes += bytes;
                report();
              },
            );
          }
        } catch (error) {
          local.abort();
          throw error;
        }
      }
    };

    const results = await Promise.allSettled(
      Array.from({ length: Math.min(COPY_CONCURRENCY, files.length) }, worker),
    );
    throwIfAborted(options.signal);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    const failure =
      failures.find((result) => !isAbortError(result.reason)) ?? failures[0];
    if (failure) throw failure.reason;

    if (copiedBytes !== totalBytes) {
      throw new DataMoveError("verify", `${copiedBytes}/${totalBytes}`);
    }

    return "copied";
  } catch (error) {
    await discardPartialCopy(to, existed);
    throw toMoveError(error);
  } finally {
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function removeOldDataRoot(
  dir: string,
  current: string,
): Promise<"removed" | "kept" | "failed"> {
  if (overlapsPath(dir, current)) return "kept";
  if (!(await isDirectory(dir))) return "removed";

  const marker = path.join(dir, MOVED_MARKER);
  const ours = (await fs.pathExists(marker)) || (await hasDataFiles(dir));
  if (!ours) return "kept";

  await fs.writeFile(marker, JSON.stringify({ movedTo: current }));

  let failed = false;
  for (const name of await fs.readdir(dir)) {
    if (name === MOVED_MARKER) continue;
    try {
      await fs.rm(path.join(dir, name), {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    } catch (error) {
      failed = true;
      console.warn(`[DataMove] Could not remove ${name}:`, error);
    }
  }

  if (failed) return "failed";

  await fs.rm(marker, { force: true });
  await fs.rmdir(dir).catch(() => undefined);
  return "removed";
}
