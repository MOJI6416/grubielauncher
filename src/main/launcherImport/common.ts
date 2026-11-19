import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import type {
  ForeignContentCounts,
  ForeignLauncher,
} from "@/types/LauncherImport";
import type { Loader } from "@/types/Loader";

export interface ForeignInstance {
  launcher: ForeignLauncher;
  root: string;
  name: string;
  minecraftVersion: string;
  loader: Loader;
  loaderVersion?: string;
  gameDir: string;
  instanceDir: string;
  prismLayout?: boolean;
  iconPath?: string;
  iconData?: string;
  memoryMb?: number;
  jvmArgs: string[];
  lastPlayed?: number;
  sharedGameDir: boolean;
  skipMods?: boolean;
  disabledModsDir?: string;
  skipEntries?: string[];
}

export function foreignInstanceId(instance: ForeignInstance): string {
  return createHash("sha1")
    .update(
      [
        instance.launcher,
        path.resolve(instance.gameDir),
        path.resolve(instance.instanceDir),
        instance.minecraftVersion,
        instance.loader,
        instance.loaderVersion ?? "",
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 20);
}

export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const text = await fs.readFile(file, "utf-8");
    return JSON.parse(text.replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

export async function readTextFile(file: string): Promise<string | null> {
  try {
    return (await fs.readFile(file, "utf-8")).replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function isFile(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isFile();
  } catch {
    return false;
  }
}

export async function listDirectories(root: string): Promise<string[]> {
  const entries = await fs
    .readdir(root, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  const result: string[] = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory() || (entry.isSymbolicLink() && (await isDirectory(full)))) {
      result.push(entry.name);
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function decodeIniValue(raw: string): string {
  let value = raw;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  return value.replace(
    /\\x([0-9a-fA-F]{1,4})|\\(["\\])/g,
    (_, hex: string | undefined, escaped: string | undefined) =>
      hex ? String.fromCharCode(parseInt(hex, 16)) : (escaped ?? ""),
  );
}

export function parseIni(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    if (key) result[key] = decodeIniValue(line.slice(separator + 1).trim());
  }
  return result;
}

export function parseProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index].trimStart();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && index + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++index].trimStart();
    }
    const match = /^((?:\\.|[^=:\s\\])+)\s*[=:\s]\s*(.*)$/.exec(line);
    if (!match) continue;
    result[unescapeProperty(match[1])] = unescapeProperty(match[2]);
  }
  return result;
}

function unescapeProperty(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escaped: string) => {
    if (escaped.length === 5) return String.fromCharCode(parseInt(escaped.slice(1), 16));
    if (escaped === "n") return "\n";
    if (escaped === "t") return "\t";
    if (escaped === "r") return "\r";
    return escaped;
  });
}

export function splitArguments(input: string | null | undefined): string[] {
  if (!input?.trim()) return [];

  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let hasToken = false;

  for (const char of input) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote === char ? null : char;
      hasToken = true;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (hasToken) args.push(current);
      current = "";
      hasToken = false;
      continue;
    }
    current += char;
    hasToken = true;
  }
  if (hasToken) args.push(current);
  return args;
}

const MEMORY_ARG = /^-Xmx(\d+)([kKmMgGtT]?)$/;

export function memoryFromArgs(args: string[]): number | undefined {
  for (const arg of args) {
    const match = MEMORY_ARG.exec(arg);
    if (!match) continue;
    return toMegabytes(Number(match[1]), match[2]);
  }
  return undefined;
}

function toMegabytes(amount: number, unit: string): number | undefined {
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  switch (unit.toLowerCase()) {
    case "k":
      return Math.round(amount / 1024);
    case "g":
      return amount * 1024;
    case "t":
      return amount * 1024 * 1024;
    case "m":
      return amount;
    default:
      return Math.round(amount / (1024 * 1024));
  }
}

export function positiveMegabytes(value: unknown): number | undefined {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return undefined;
  return number > 0 ? Math.round(number) : undefined;
}

export function timestampOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export function loaderFromName(value: unknown): Loader | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().replace(/[_\s-]+/g, "");
  if (normalized.includes("neoforge")) return "neoforge";
  if (normalized.includes("legacyfabric")) return "legacy-fabric";
  if (normalized.includes("forge")) return "forge";
  if (normalized.includes("quilt")) return "quilt";
  if (normalized.includes("fabric")) return "fabric";
  if (normalized.includes("vanilla") || normalized === "minecraft") return "vanilla";
  return undefined;
}

export function stripMinecraftVersion(
  loaderVersion: string | undefined,
  minecraftVersion: string,
): string | undefined {
  if (!loaderVersion) return undefined;
  let version = loaderVersion.trim();
  if (version.startsWith(`${minecraftVersion}-`)) {
    version = version.slice(minecraftVersion.length + 1);
  }
  if (version.endsWith(`-${minecraftVersion}`)) {
    version = version.slice(0, -(minecraftVersion.length + 1));
  }
  return version || undefined;
}

const MOD_FILE = /\.(?:jar|zip|litemod)(?:\.disabled)?$/i;
const PACK_FILE = /\.zip(?:\.disabled)?$/i;
const SCREENSHOT_FILE = /\.(?:png|jpe?g)$/i;

async function countEntries(
  folder: string,
  accept: (name: string, isDirectory: boolean) => boolean | Promise<boolean>,
): Promise<number> {
  const entries = await fs
    .readdir(folder, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  let count = 0;
  for (const entry of entries) {
    if (await accept(entry.name, entry.isDirectory())) count++;
  }
  return count;
}

export async function countContent(
  instance: Pick<ForeignInstance, "gameDir" | "skipMods" | "disabledModsDir">,
): Promise<ForeignContentCounts> {
  const { gameDir } = instance;
  const mods = instance.skipMods
    ? 0
    : (await countEntries(path.join(gameDir, "mods"), (name, dir) => !dir && MOD_FILE.test(name))) +
      (instance.disabledModsDir
        ? await countEntries(instance.disabledModsDir, (name, dir) => !dir && MOD_FILE.test(name))
        : 0);
  const worlds = await countEntries(path.join(gameDir, "saves"), (name, dir) =>
    dir ? fs.pathExists(path.join(gameDir, "saves", name, "level.dat")) : false,
  );
  const screenshots = await countEntries(
    path.join(gameDir, "screenshots"),
    (name, dir) => !dir && SCREENSHOT_FILE.test(name),
  );
  const packs =
    (await countEntries(
      path.join(gameDir, "resourcepacks"),
      (name, dir) => dir || PACK_FILE.test(name),
    )) +
    (await countEntries(
      path.join(gameDir, "shaderpacks"),
      (name, dir) => dir || PACK_FILE.test(name),
    ));

  return { mods, worlds, screenshots, packs };
}
