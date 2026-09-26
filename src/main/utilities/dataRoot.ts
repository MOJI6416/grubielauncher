import { app } from "electron";
import fs from "fs";
import path from "path";
import type { DataLocationFile } from "@/types/DataLocation";

export const DEFAULT_DATA_DIR = ".grubielauncher";
const LOCATION_FILE = "data-location.json";

let cache: { key: string; root: string } | null = null;

export function getDefaultDataRoot(): string {
  return path.join(app.getPath("appData"), DEFAULT_DATA_DIR);
}

function getLocationFilePath(): string | null {
  try {
    const userData = app.getPath("userData");
    return userData ? path.join(userData, LOCATION_FILE) : null;
  } catch {
    return null;
  }
}

function isAbsoluteString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length < 1024 &&
    !value.includes("\0") &&
    path.isAbsolute(value)
  );
}

export function sanitizeDataLocation(value: unknown): DataLocationFile {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const result: DataLocationFile = {};

  if (isAbsoluteString(raw.root)) result.root = path.resolve(raw.root);

  const move = raw.move as Record<string, unknown> | undefined;
  if (move && isAbsoluteString(move.from) && isAbsoluteString(move.to)) {
    result.move = { from: path.resolve(move.from), to: path.resolve(move.to) };
  }

  if (Array.isArray(raw.cleanup)) {
    const cleanup = raw.cleanup
      .filter(isAbsoluteString)
      .map((entry) => path.resolve(entry));
    if (cleanup.length > 0) result.cleanup = [...new Set(cleanup)];
  }

  return result;
}

export function readDataLocation(): DataLocationFile {
  const file = getLocationFilePath();
  if (!file) return {};

  try {
    return sanitizeDataLocation(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    return {};
  }
}

export function writeDataLocation(next: DataLocationFile): void {
  const file = getLocationFilePath();
  if (!file) throw new Error("userData is not available");

  const clean = sanitizeDataLocation(next);
  if (clean.root && isSamePath(clean.root, getDefaultDataRoot())) {
    delete clean.root;
  }

  cache = null;
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (!clean.root && !clean.move && !clean.cleanup) {
    fs.rmSync(file, { force: true });
    return;
  }

  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(clean, null, 2), "utf-8");
  fs.renameSync(temp, file);
}

export function getDataRoot(): string {
  const defaultRoot = getDefaultDataRoot();
  const key = `${defaultRoot}|${getLocationFilePath() ?? ""}`;
  if (cache?.key === key) return cache.root;

  const root = readDataLocation().root ?? defaultRoot;
  cache = { key, root };
  return root;
}

function comparable(target: string): string {
  const resolved = path.resolve(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isSamePath(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

export function isInsidePath(child: string, parent: string): boolean {
  const relative = path.relative(comparable(parent), comparable(child));
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

export function overlapsPath(a: string, b: string): boolean {
  return isSamePath(a, b) || isInsidePath(a, b) || isInsidePath(b, a);
}
