import path from "path";
import type { Loader } from "@/types/Loader";
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

interface CurseForgeInstance {
  name?: string;
  gameVersion?: string;
  baseModLoader?: {
    name?: string;
    minecraftVersion?: string;
  } | null;
  profileImagePath?: string | null;
  lastPlayed?: string | number;
  isMemoryOverride?: boolean;
  allocatedMemory?: number;
  javaArgsOverride?: string | null;
}

export function parseCurseForgeLoader(
  name: string | undefined,
  minecraftVersion: string,
): { loader: Loader; loaderVersion?: string } | null {
  if (!name) return { loader: "vanilla" };
  const separator = name.indexOf("-");
  const kind = loaderFromName(separator === -1 ? name : name.slice(0, separator));
  if (!kind || kind === "vanilla") return kind ? { loader: "vanilla" } : null;
  const loaderVersion = stripMinecraftVersion(
    separator === -1 ? undefined : name.slice(separator + 1),
    minecraftVersion,
  );
  return loaderVersion ? { loader: kind, loaderVersion } : { loader: kind };
}

export async function readCurseForgeInstance(
  root: string,
  instanceDir: string,
): Promise<ForeignInstance | null> {
  const data = await readJsonFile<CurseForgeInstance>(
    path.join(instanceDir, "minecraftinstance.json"),
  );
  const minecraftVersion =
    data?.gameVersion?.trim() || data?.baseModLoader?.minecraftVersion?.trim();
  if (!data || !minecraftVersion) return null;

  const loader = parseCurseForgeLoader(data.baseModLoader?.name, minecraftVersion);
  if (!loader) return null;

  const iconPath = data.profileImagePath?.trim();

  return {
    launcher: "curseforge",
    root,
    name: data.name?.trim() || path.basename(instanceDir),
    minecraftVersion,
    ...loader,
    gameDir: instanceDir,
    instanceDir,
    iconPath: iconPath && path.isAbsolute(iconPath) ? iconPath : undefined,
    memoryMb: data.isMemoryOverride ? positiveMegabytes(data.allocatedMemory) : undefined,
    jvmArgs: splitArguments(data.javaArgsOverride),
    lastPlayed: timestampOf(data.lastPlayed),
    sharedGameDir: false,
    skipEntries: ["minecraftinstance.json", ".curseclient"],
  };
}

export async function scanCurseForgeRoot(
  root: string,
  instancesOverride?: string,
): Promise<ForeignInstance[]> {
  const instancesDir = instancesOverride ?? path.join(root, "Instances");
  const result: ForeignInstance[] = [];
  for (const folder of await listDirectories(instancesDir)) {
    const instance = await readCurseForgeInstance(root, path.join(instancesDir, folder));
    if (instance) result.push(instance);
  }
  return result;
}
