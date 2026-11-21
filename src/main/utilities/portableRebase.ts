import fs from "fs-extra";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const MARKER_FILE = "portable-root.json";
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const STORAGE_DEPTH = 6;
const MEDIA_PREFIX = "app://media/?";

function startsWithPath(value: string, root: string): boolean {
  if (value.length < root.length) return false;
  if (value.slice(0, root.length).toLowerCase() !== root.toLowerCase()) {
    return false;
  }
  const next = value.charAt(root.length);
  return next === "" || next === "\\" || next === "/";
}

export function rebaseWindowsPath(
  value: string,
  from: string,
  to: string,
): string | null {
  return startsWithPath(value, from) ? to + value.slice(from.length) : null;
}

function rebaseFileUrl(value: string, from: string, to: string): string | null {
  let url: URL;
  let local: string;
  try {
    url = new URL(value);
    local = fileURLToPath(url, { windows: true });
  } catch {
    return null;
  }
  const rebased = rebaseWindowsPath(local, from, to);
  if (rebased === null) return null;
  const next = pathToFileURL(rebased, { windows: true });
  next.search = url.search;
  next.hash = url.hash;
  return next.href;
}

function rebaseMediaUrl(
  value: string,
  from: string,
  to: string,
): string | null {
  const params = new URLSearchParams(value.slice(MEDIA_PREFIX.length));
  const local = params.get("p");
  if (!local) return null;
  const rebased = rebaseWindowsPath(local, from, to);
  if (rebased === null) return null;
  params.set("p", rebased);
  const query = [...params]
    .map(([key, entry]) => `${key}=${encodeURIComponent(entry)}`)
    .join("&");
  return `${MEDIA_PREFIX}${query}`;
}

export function rebaseString(
  value: string,
  from: string,
  to: string,
): string | null {
  if (value.startsWith("file:")) return rebaseFileUrl(value, from, to);
  if (value.startsWith(MEDIA_PREFIX)) return rebaseMediaUrl(value, from, to);
  return rebaseWindowsPath(value, from, to);
}

export function rebaseValue(
  value: unknown,
  from: string,
  to: string,
): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const rebased = rebaseString(value, from, to);
    return rebased === null || rebased === value
      ? { value, changed: false }
      : { value: rebased, changed: true };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = rebaseValue(item, from, to);
      changed ||= result.changed;
      return result.value;
    });
    return changed ? { value: next, changed } : { value, changed };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const result = rebaseValue(item, from, to);
      changed ||= result.changed;
      next[key] = result.value;
    }
    return changed ? { value: next, changed } : { value, changed };
  }

  return { value, changed: false };
}

async function rebaseJsonFile(
  file: string,
  from: string,
  to: string,
): Promise<boolean> {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile() || stat.size > MAX_JSON_BYTES) return false;

  const text = await fs.readFile(file, "utf8").catch(() => null);
  if (text === null) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }

  const result = rebaseValue(parsed, from, to);
  if (!result.changed) return false;

  const indent = /^[{[]\r?\n([ \t]+)/.exec(text)?.[1];
  const ending = text.endsWith("\n") ? "\n" : "";
  const temp = `${file}.${process.pid}.rebase`;
  await fs.writeFile(temp, JSON.stringify(result.value, null, indent) + ending);
  await fs.rename(temp, file);
  return true;
}

async function jsonFiles(dir: string, depth: number): Promise<string[]> {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(full);
    } else if (entry.isDirectory() && depth > 0) {
      files.push(...(await jsonFiles(full, depth - 1)));
    }
  }
  return files;
}

async function instanceDirs(dataRoot: string): Promise<string[]> {
  const versions = path.join(dataRoot, "minecraft", "versions");
  const entries = await fs
    .readdir(versions, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(versions, entry.name));
}

export async function launcherJsonFiles(
  dataRoot: string,
  userData: string,
): Promise<string[]> {
  const files = [
    ...(await jsonFiles(userData, 0)),
    ...(await jsonFiles(dataRoot, 0)),
  ];
  for (const dir of ["themes", "sync", "java", "backups", "skins"]) {
    files.push(...(await jsonFiles(path.join(dataRoot, dir), 0)));
  }
  for (const instance of await instanceDirs(dataRoot)) {
    files.push(path.join(instance, "version.json"));
    files.push(
      ...(await jsonFiles(path.join(instance, "storage"), STORAGE_DEPTH)),
    );
  }
  return files;
}

async function readMarker(userData: string): Promise<string | null> {
  const marker = await fs
    .readJSON(path.join(userData, MARKER_FILE))
    .catch(() => null);
  const root = (marker as { root?: unknown } | null)?.root;
  return typeof root === "string" && path.win32.isAbsolute(root) ? root : null;
}

export async function rebasePortableData(options: {
  root: string;
  dataRoot: string;
  userData: string;
}): Promise<{ from: string | null; files: number }> {
  const { root, dataRoot, userData } = options;
  const previous = await readMarker(userData);
  let files = 0;

  if (previous && previous.toLowerCase() !== root.toLowerCase()) {
    for (const file of await launcherJsonFiles(dataRoot, userData)) {
      if (path.basename(file) === MARKER_FILE) continue;
      if (await rebaseJsonFile(file, previous, root).catch(() => false)) {
        files += 1;
      }
    }
  }

  if (previous !== root) {
    await fs.outputJSON(path.join(userData, MARKER_FILE), { root });
  }

  return { from: previous, files };
}
