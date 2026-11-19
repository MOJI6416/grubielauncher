import path from "path";
import fs from "fs-extra";
import {
  type ForeignInstance,
  listDirectories,
  loaderFromName,
  positiveMegabytes,
  readJsonFile,
  splitArguments,
  stripMinecraftVersion,
  timestampOf,
} from "../common";

interface AtInstance {
  id?: string;
  launcher?: {
    name?: string;
    pack?: string;
    loaderVersion?: { type?: string; version?: string } | null;
    maximumMemory?: number | null;
    javaArguments?: string | null;
    lastPlayed?: string | number;
  };
}

interface AtSettings {
  maximumMemory?: number;
  javaParameters?: string;
}

async function iconOf(root: string, instanceDir: string, pack: string | undefined) {
  const own = path.join(instanceDir, "instance.png");
  if (await fs.pathExists(own)) return own;

  const safeName = (pack ?? "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  if (!safeName) return undefined;
  const shared = path.join(root, "configs", "images", `${safeName}.png`);
  return (await fs.pathExists(shared)) ? shared : undefined;
}

export async function scanAtLauncherRoot(root: string): Promise<ForeignInstance[]> {
  const settings = await readJsonFile<AtSettings>(path.join(root, "configs", "ATLauncher.json"));
  const instancesDir = path.join(root, "instances");
  const result: ForeignInstance[] = [];

  for (const folder of await listDirectories(instancesDir)) {
    const instanceDir = path.join(instancesDir, folder);
    const data = await readJsonFile<AtInstance>(path.join(instanceDir, "instance.json"));
    const minecraftVersion = data?.id?.trim();
    if (!data?.launcher || !minecraftVersion) continue;

    const loaderInfo = data.launcher.loaderVersion;
    const loader = loaderInfo ? loaderFromName(loaderInfo.type) : "vanilla";
    if (!loader) continue;

    const ownArgs = data.launcher.javaArguments;

    result.push({
      launcher: "atlauncher",
      root,
      name: data.launcher.name?.trim() || folder,
      minecraftVersion,
      loader,
      loaderVersion:
        loader === "vanilla"
          ? undefined
          : stripMinecraftVersion(loaderInfo?.version, minecraftVersion),
      gameDir: instanceDir,
      instanceDir,
      iconPath: await iconOf(root, instanceDir, data.launcher.pack),
      memoryMb:
        positiveMegabytes(data.launcher.maximumMemory) ??
        positiveMegabytes(settings?.maximumMemory),
      jvmArgs: splitArguments(
        typeof ownArgs === "string" ? ownArgs : settings?.javaParameters,
      ),
      lastPlayed: timestampOf(data.launcher.lastPlayed),
      sharedGameDir: false,
      disabledModsDir: path.join(instanceDir, "disabledmods"),
      skipEntries: ["instance.json", "instance.png", "disabledmods"],
    });
  }

  return result;
}
