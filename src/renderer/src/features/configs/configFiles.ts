export interface ConfigEntry {
  relative: string;
  name: string;
  folder: string;
  base: string;
}

export interface DirectoryEntry {
  path: string;
  type: "file" | "folder";
}

export const EDITABLE_CONFIG_EXTENSIONS = [
  ".cfg",
  ".conf",
  ".hjson",
  ".ini",
  ".js",
  ".json",
  ".json5",
  ".lua",
  ".mcmeta",
  ".properties",
  ".snbt",
  ".toml",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zs",
];

export const CONFIG_ROOT_FOLDERS = [
  "config",
  "defaultconfigs",
  "kubejs",
  "scripts",
];

export const MAX_CONFIG_BYTES = 512 * 1024;

const SKIPPED_FOLDERS = ["backups", "cache", "logs", "node_modules"];

export function isEditableConfig(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return EDITABLE_CONFIG_EXTENSIONS.some((extension) =>
    lower.endsWith(extension),
  );
}

export function splitConfigPath(relative: string): {
  folder: string;
  name: string;
} {
  const index = relative.lastIndexOf("/");
  if (index === -1) return { folder: "", name: relative };

  return {
    folder: relative.slice(0, index),
    name: relative.slice(index + 1),
  };
}

export function sortConfigEntries(entries: ConfigEntry[]): ConfigEntry[] {
  return [...entries].sort((a, b) => {
    if (a.folder !== b.folder) return a.folder.localeCompare(b.folder);
    return a.name.localeCompare(b.name);
  });
}

export async function collectConfigFiles(
  readDirectory: (directory: string) => Promise<DirectoryEntry[]>,
  root: string,
  options: {
    maxDepth?: number;
    maxFiles?: number;
    base?: string;
    prefix?: string;
  } = {},
): Promise<ConfigEntry[]> {
  const maxDepth = options.maxDepth ?? 3;
  const maxFiles = options.maxFiles ?? 400;
  const base = options.base ?? root;
  const prefix = options.prefix ?? "";
  const found: ConfigEntry[] = [];

  const walk = async (directory: string, relative: string, depth: number) => {
    if (depth > maxDepth || found.length >= maxFiles) return;

    let entries: DirectoryEntry[] = [];
    try {
      entries = await readDirectory(directory);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (found.length >= maxFiles) return;

      const nextRelative = relative ? `${relative}/${entry.path}` : entry.path;

      if (entry.type === "folder") {
        if (SKIPPED_FOLDERS.includes(entry.path.toLowerCase())) continue;
        await walk(`${directory}/${entry.path}`, nextRelative, depth + 1);
        continue;
      }

      if (!isEditableConfig(entry.path)) continue;

      const key = `${prefix}${nextRelative}`;
      found.push({ relative: key, base, ...splitConfigPath(key) });
    }
  };

  await walk(root, "", 1);

  return sortConfigEntries(found);
}

export async function collectInstanceConfigs(
  readDirectory: (directory: string) => Promise<DirectoryEntry[]>,
  pathExists: (target: string) => Promise<boolean>,
  joinPath: (...parts: string[]) => string,
  versionPath: string,
  maxFiles = 800,
): Promise<ConfigEntry[]> {
  const collected: ConfigEntry[] = [];

  for (const folder of CONFIG_ROOT_FOLDERS) {
    if (collected.length >= maxFiles) break;

    const root = joinPath(versionPath, folder);
    if (!(await pathExists(root))) continue;

    const isDefaultRoot = folder === "config";

    collected.push(
      ...(await collectConfigFiles(readDirectory, root, {
        maxFiles: maxFiles - collected.length,
        base: isDefaultRoot ? root : versionPath,
        prefix: isDefaultRoot ? "" : `${folder}/`,
      })),
    );
  }

  return sortConfigEntries(collected);
}
