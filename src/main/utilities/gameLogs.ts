import fs from "fs-extra";
import path from "path";
import zlib from "zlib";
import { GameLogKind, IGameLogContent, IGameLogFile } from "@/types/GameLog";
import { assertReadablePath } from "./safePath";

const MAX_READ_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 60;

const LOGS_DIR = "logs";
const REPORTS_DIR = "crash-reports";

export function classifyLogName(name: string): GameLogKind | null {
  const lower = name.toLowerCase();
  if (lower === "latest.log") return "latest";
  if (lower === "debug.log") return "debug";
  if (lower.endsWith(".log") || lower.endsWith(".log.gz")) return "archive";
  return null;
}

function isSafeName(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name.includes("\0")) return false;
  return path.basename(name) === name && name !== "." && name !== "..";
}

async function collect(
  dir: string,
  classify: (name: string) => GameLogKind | null,
): Promise<IGameLogFile[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }

  const files: IGameLogFile[] = [];

  for (const name of names.slice(0, MAX_FILES * 4)) {
    if (!isSafeName(name)) continue;

    const kind = classify(name);
    if (!kind) continue;

    const stats = await fs.stat(path.join(dir, name)).catch(() => null);
    if (!stats?.isFile()) continue;

    files.push({ name, kind, size: stats.size, modifiedAt: stats.mtimeMs });
  }

  return files;
}

const NATIVE_DUMP = /^hs_err_pid\d+\.log$/i;

export async function listGameLogs(
  versionPath: string,
): Promise<IGameLogFile[]> {
  assertReadablePath(versionPath, "logs:list");

  const [logs, reports, natives] = await Promise.all([
    collect(path.join(versionPath, LOGS_DIR), classifyLogName),
    collect(path.join(versionPath, REPORTS_DIR), (name) =>
      name.toLowerCase().endsWith(".txt") ? "crash" : null,
    ),
    collect(versionPath, (name) => (NATIVE_DUMP.test(name) ? "native" : null)),
  ]);

  return [...logs, ...reports, ...natives]
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, MAX_FILES);
}

export function resolveGameLogPath(
  versionPath: string,
  name: string,
  kind: GameLogKind,
): string {
  if (!isSafeName(name)) {
    throw new Error(`Refused log name: ${name}`);
  }

  if (kind === "native") return path.join(versionPath, name);

  const dir = kind === "crash" ? REPORTS_DIR : LOGS_DIR;
  return path.join(versionPath, dir, name);
}

async function readTail(filePath: string, size: number): Promise<string> {
  const start = Math.max(0, size - MAX_READ_BYTES);
  const chunks: Buffer[] = [];

  for await (const chunk of fs.createReadStream(filePath, { start })) {
    chunks.push(chunk as Buffer);
  }

  let buffer = Buffer.concat(chunks);
  if (start > 0) {
    const newline = buffer.indexOf(0x0a);
    if (newline !== -1) buffer = buffer.subarray(newline + 1);
  }

  return buffer.toString("utf-8");
}

async function readGzipTail(
  filePath: string,
): Promise<{ text: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let kept = 0;
  let dropped = false;

  const stream = fs.createReadStream(filePath).pipe(zlib.createGunzip());

  for await (const chunk of stream) {
    const buffer = chunk as Buffer;
    chunks.push(buffer);
    kept += buffer.length;

    while (kept - (chunks[0]?.length ?? 0) >= MAX_READ_BYTES) {
      kept -= chunks[0].length;
      chunks.shift();
      dropped = true;
    }
  }

  let buffer = Buffer.concat(chunks);
  if (buffer.length > MAX_READ_BYTES) {
    buffer = buffer.subarray(buffer.length - MAX_READ_BYTES);
    dropped = true;
  }

  if (dropped) {
    const newline = buffer.indexOf(0x0a);
    if (newline !== -1) buffer = buffer.subarray(newline + 1);
  }

  return { text: buffer.toString("utf-8"), truncated: dropped };
}

export async function readGameLog(
  versionPath: string,
  name: string,
  kind: GameLogKind,
): Promise<IGameLogContent | null> {
  const filePath = resolveGameLogPath(versionPath, name, kind);
  assertReadablePath(filePath, "logs:read");

  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats?.isFile()) return null;

  if (name.toLowerCase().endsWith(".gz")) {
    const unpacked = await readGzipTail(filePath);
    return {
      text: unpacked.text,
      truncated: unpacked.truncated,
      size: stats.size,
      path: filePath,
    };
  }

  return {
    text: await readTail(filePath, stats.size),
    truncated: stats.size > MAX_READ_BYTES,
    size: stats.size,
    path: filePath,
  };
}
