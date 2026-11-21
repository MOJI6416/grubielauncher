import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { directoryFiles } from "./jarScan";
import { isManagedPackFile, readOptionList } from "./optionsTxt";

export interface ContentSource {
  id: string;
  path: string;
  identity: string;
  label: string;
  assetsRoot?: boolean;
}

export const PLAYER_PACK_FOLDER = "resourcepacks";

const PACK_FOLDERS = [
  PLAYER_PACK_FOLDER,
  "config/paxi/resourcepacks",
  "config/openloader/resources",
  "config/openloader/packs",
  "global_packs/required_resources",
  "global_packs/optional_resources",
];

const SINGLE_PACKS: Array<{ folder: string; label: string; assetsRoot?: boolean }> = [
  { folder: "kubejs", label: "KubeJS" },
  { folder: "resources", label: "ResourceLoader", assetsRoot: true },
];

async function enabledPlayerPacks(versionPath: string): Promise<(name: string) => boolean> {
  const options = await fs
    .readFile(path.join(versionPath, "options.txt"), "utf8")
    .catch(() => "");
  const enabled = new Set(
    (readOptionList(options, "resourcePacks") ?? [])
      .filter((entry) => entry.startsWith("file/"))
      .map((entry) => entry.slice(5)),
  );
  const overrides = await fs
    .readFile(path.join(versionPath, "config", "resourcepackoverrides.json"), "utf8")
    .catch(() => "");
  return (name) => enabled.has(name) || (!!overrides && overrides.includes(name));
}

async function directoryIdentity(
  root: string,
  assetsRoot = false,
): Promise<string | null> {
  const files = await directoryFiles(root, assetsRoot);
  if (files.length === 0) return null;
  const digest = createHash("sha1");
  for (const file of files) {
    digest.update(`${file.name}\u0000${file.size}\u0000${file.mtimeMs}\n`);
  }
  return `dir:${digest.digest("hex")}`;
}

async function sourceAt(
  versionPath: string,
  file: string,
  label: string,
  assetsRoot = false,
): Promise<ContentSource | null> {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) return null;
  let identity: string | null = null;
  if (stat.isDirectory()) {
    identity = await directoryIdentity(file, assetsRoot);
  } else if (stat.isFile() && /\.(?:zip|jar)$/i.test(file)) {
    identity = `zip:${stat.size}:${stat.mtimeMs}`;
  }
  if (!identity) return null;
  const relative = path.relative(versionPath, file).split(path.sep).join("/");
  return {
    id: `pack:${relative}`,
    path: file,
    identity,
    label,
    ...(assetsRoot ? { assetsRoot } : {}),
  };
}

export async function listModpackPacks(
  versionPath: string,
): Promise<ContentSource[]> {
  const sources: ContentSource[] = [];
  const isEnabled = await enabledPlayerPacks(versionPath);
  for (const folder of PACK_FOLDERS) {
    const root = path.join(versionPath, ...folder.split("/"));
    const names = await fs.readdir(root).catch(() => [] as string[]);
    for (const name of names.sort()) {
      if (
        folder === PLAYER_PACK_FOLDER &&
        (isManagedPackFile(name) || !isEnabled(name))
      ) {
        continue;
      }
      const source = await sourceAt(
        versionPath,
        path.join(root, name),
        name.replace(/\.(?:zip|jar)$/i, ""),
      );
      if (source) sources.push(source);
    }
  }
  for (const { folder, label, assetsRoot } of SINGLE_PACKS) {
    const source = await sourceAt(
      versionPath,
      path.join(versionPath, folder),
      label,
      assetsRoot,
    );
    if (source) sources.push(source);
  }
  return sources;
}
