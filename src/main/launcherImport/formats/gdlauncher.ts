import path from "path";
import fs from "fs-extra";
import type { Loader } from "@/types/Loader";
import {
  type ForeignInstance,
  isDirectory,
  listDirectories,
  loaderFromName,
  positiveMegabytes,
  readJsonFile,
  readTextFile,
  splitArguments,
  stripMinecraftVersion,
  timestampOf,
} from "../common";

interface GdLegacyConfig {
  loader?: {
    loaderType?: string;
    loaderVersion?: string | null;
    mcVersion?: string;
  };
  background?: string | null;
  javaArgs?: string | null;
  javaMemory?: number | null;
  lastPlayed?: number | string;
}

interface GdCarbonModloader {
  type_?: string;
  type?: string;
  version?: string;
}

interface GdCarbonVersion {
  release?: string;
  modloaders?: GdCarbonModloader[];
}

interface GdCarbonInstance {
  name?: string;
  icon?: string | null;
  last_played?: string | number | null;
  game_configuration?: {
    version?: GdCarbonVersion | { Standard?: GdCarbonVersion } | string | null;
    global_java_args?: boolean;
    extra_java_args?: string | null;
    memory?: { min_mb?: number; max_mb?: number } | null;
  };
}

function insideFolder(folder: string, relative: string | null | undefined) {
  if (!relative?.trim()) return undefined;
  const resolved = path.resolve(folder, relative);
  const back = path.relative(folder, resolved);
  return back && !back.startsWith("..") && !path.isAbsolute(back) ? resolved : undefined;
}

export async function scanGdLegacyRoot(root: string): Promise<ForeignInstance[]> {
  const instancesDir = path.join(root, "instances");
  const result: ForeignInstance[] = [];

  for (const folder of await listDirectories(instancesDir)) {
    const instanceDir = path.join(instancesDir, folder);
    const config = await readJsonFile<GdLegacyConfig>(path.join(instanceDir, "config.json"));
    const minecraftVersion = config?.loader?.mcVersion?.trim();
    if (!config?.loader || !minecraftVersion) continue;

    const loader = loaderFromName(config.loader.loaderType ?? "vanilla");
    if (!loader) continue;

    const background = insideFolder(instanceDir, config.background);

    result.push({
      launcher: "gdlauncher",
      root,
      name: folder,
      minecraftVersion,
      loader,
      loaderVersion:
        loader === "vanilla"
          ? undefined
          : stripMinecraftVersion(config.loader.loaderVersion ?? undefined, minecraftVersion),
      gameDir: instanceDir,
      instanceDir,
      iconPath: background,
      memoryMb: positiveMegabytes(config.javaMemory),
      jvmArgs: splitArguments(config.javaArgs),
      lastPlayed: timestampOf(config.lastPlayed),
      sharedGameDir: false,
      skipEntries: ["config.json", ...(background ? [path.basename(background)] : [])],
    });
  }

  return result;
}

function carbonVersion(
  value: NonNullable<GdCarbonInstance["game_configuration"]>["version"],
): GdCarbonVersion | null {
  if (!value || typeof value !== "object") return null;
  if ("Standard" in value && value.Standard) return value.Standard;
  return value as GdCarbonVersion;
}

export async function carbonRuntimeRoot(appData: string): Promise<string> {
  const override = (await readTextFile(path.join(appData, "runtime_path_override")))?.trim();
  if (override && path.isAbsolute(override) && (await isDirectory(override))) return override;
  return path.join(appData, "data");
}

export async function scanGdCarbonRoot(runtimeRoot: string): Promise<ForeignInstance[]> {
  const instancesDir = path.join(runtimeRoot, "instances");
  const result: ForeignInstance[] = [];

  for (const folder of await listDirectories(instancesDir)) {
    const instanceDir = path.join(instancesDir, folder);
    const data = await readJsonFile<GdCarbonInstance>(path.join(instanceDir, "instance.json"));
    const version = carbonVersion(data?.game_configuration?.version);
    const minecraftVersion = version?.release?.trim();
    if (!data || !minecraftVersion) continue;

    const modloader = version?.modloaders?.[0];
    const loader: Loader | undefined = modloader
      ? loaderFromName(modloader.type_ ?? modloader.type)
      : "vanilla";
    if (!loader) continue;

    const gameDir = path.join(instanceDir, "instance");
    const config = data.game_configuration;
    const icon = insideFolder(instanceDir, data.icon);

    result.push({
      launcher: "gdlauncher",
      root: runtimeRoot,
      name: data.name?.trim() || folder,
      minecraftVersion,
      loader,
      loaderVersion:
        loader === "vanilla"
          ? undefined
          : stripMinecraftVersion(modloader?.version, minecraftVersion),
      gameDir,
      instanceDir,
      iconPath: icon && (await fs.pathExists(icon)) ? icon : undefined,
      memoryMb: positiveMegabytes(config?.memory?.max_mb),
      jvmArgs: splitArguments(config?.extra_java_args),
      lastPlayed: timestampOf(data.last_played),
      sharedGameDir: false,
    });
  }

  return result;
}
