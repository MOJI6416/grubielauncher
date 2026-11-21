import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { directoryFiles } from "./jarScan";
import { isManagedPackFile } from "./optionsTxt";

export interface ContentSource {
  id: string;
  path: string;
  identity: string;
  label: string;
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

const SINGLE_PACKS: Array<{ folder: string; label: string }> = [
  { folder: "kubejs", label: "KubeJS" },
];

async function directoryIdentity(root: string): Promise<string | null> {
  const files = await directoryFiles(root);
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
): Promise<ContentSource | null> {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) return null;
  let identity: string | null = null;
  if (stat.isDirectory()) {
    identity = await directoryIdentity(file);
  } else if (stat.isFile() && /\.(?:zip|jar)$/i.test(file)) {
    identity = `zip:${stat.size}:${stat.mtimeMs}`;
  }
  if (!identity) return null;
  const relative = path.relative(versionPath, file).split(path.sep).join("/");
  return { id: `pack:${relative}`, path: file, identity, label };
}

export async function listModpackPacks(
  versionPath: string,
): Promise<ContentSource[]> {
  const sources: ContentSource[] = [];
  for (const folder of PACK_FOLDERS) {
    const root = path.join(versionPath, ...folder.split("/"));
    const names = await fs.readdir(root).catch(() => [] as string[]);
    for (const name of names.sort()) {
      if (folder === PLAYER_PACK_FOLDER && isManagedPackFile(name)) continue;
      const source = await sourceAt(
        versionPath,
        path.join(root, name),
        name.replace(/\.(?:zip|jar)$/i, ""),
      );
      if (source) sources.push(source);
    }
  }
  for (const { folder, label } of SINGLE_PACKS) {
    const source = await sourceAt(versionPath, path.join(versionPath, folder), label);
    if (source) sources.push(source);
  }
  return sources;
}
