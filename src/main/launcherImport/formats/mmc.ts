import path from "path";
import fs from "fs-extra";
import { readPrismInstance } from "../../utilities/modManager";
import {
  type ForeignInstance,
  isDirectory,
  listDirectories,
  parseIni,
  positiveMegabytes,
  readTextFile,
  splitArguments,
  timestampOf,
} from "../common";

export type MmcLauncher = "prism" | "multimc";

const CONFIG_FILES: Record<MmcLauncher, string[]> = {
  prism: ["prismlauncher.cfg", "polymc.cfg"],
  multimc: ["multimc.cfg"],
};

const ICON_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".svg"];

async function readLauncherConfig(root: string, launcher: MmcLauncher) {
  for (const name of CONFIG_FILES[launcher]) {
    const text = await readTextFile(path.join(root, name));
    if (text !== null) return parseIni(text);
  }
  return null;
}

export async function isMmcRoot(root: string, launcher: MmcLauncher): Promise<boolean> {
  for (const name of CONFIG_FILES[launcher]) {
    if (await fs.pathExists(path.join(root, name))) return true;
  }
  return false;
}

function resolveFolder(root: string, value: string | undefined, fallback: string) {
  const folder = value?.trim() || fallback;
  return path.isAbsolute(folder) ? folder : path.join(root, folder);
}

async function findIcon(iconsDir: string, key: string | undefined) {
  const iconKey = key?.trim();
  if (!iconKey || iconKey === "default" || /[\\/]/.test(iconKey)) return undefined;

  for (const extension of ICON_EXTENSIONS) {
    const candidate = path.join(iconsDir, `${iconKey}${extension}`);
    if (await fs.pathExists(candidate)) return candidate;
  }
  return undefined;
}

async function gameDirOf(instanceDir: string) {
  for (const name of [".minecraft", "minecraft"]) {
    const candidate = path.join(instanceDir, name);
    if (await isDirectory(candidate)) return candidate;
  }
  return path.join(instanceDir, ".minecraft");
}

function maxMemory(config: Record<string, string>) {
  return positiveMegabytes(config.maxmemalloc ?? config.maxmemoryalloc);
}

export async function scanMmcRoot(
  root: string,
  launcher: MmcLauncher,
  instancesOverride?: string,
): Promise<ForeignInstance[]> {
  const launcherConfig = (await readLauncherConfig(root, launcher)) ?? {};
  const instancesDir =
    instancesOverride ?? resolveFolder(root, launcherConfig.instancedir, "instances");
  const iconsDir = resolveFolder(root, launcherConfig.iconsdir, "icons");
  const globalMemory = maxMemory(launcherConfig);
  const globalArgs = splitArguments(launcherConfig.jvmargs);

  const result: ForeignInstance[] = [];
  for (const folder of await listDirectories(instancesDir)) {
    if (folder.startsWith(".") || folder.startsWith("_")) continue;

    const instanceDir = path.join(instancesDir, folder);
    const info = await readPrismInstance(instanceDir);
    if (!info) continue;

    const config = parseIni(
      (await readTextFile(path.join(instanceDir, "instance.cfg"))) ?? "",
    );
    const legacyOverride = config.overridejava === "true";
    const memoryMb =
      config.overridememory === "true" || legacyOverride
        ? (maxMemory(config) ?? globalMemory)
        : globalMemory;
    const jvmArgs =
      config.overridejavaargs === "true" || legacyOverride
        ? splitArguments(config.jvmargs)
        : globalArgs;

    result.push({
      launcher,
      root,
      name: config.name?.trim() || info.name,
      minecraftVersion: info.minecraftVersion,
      loader: info.loader,
      loaderVersion: info.loaderVersion,
      gameDir: await gameDirOf(instanceDir),
      instanceDir,
      prismLayout: true,
      iconPath: await findIcon(iconsDir, config.iconkey),
      memoryMb,
      jvmArgs,
      lastPlayed: timestampOf(Number(config.lastlaunchtime)),
      sharedGameDir: false,
    });
  }

  return result;
}
