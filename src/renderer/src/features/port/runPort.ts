import { getDefaultStore } from "jotai";
import { ProjectType } from "@/types/ModManager";
import { Version } from "@renderer/classes/Version";
import { pathsAtom } from "@renderer/stores/atoms";
import { createInstance } from "@renderer/features/newInstance/createInstance";
import { checkBlockedMods } from "@renderer/utilities/blockedMods";
import type { PortTarget } from "./analyzePort";
import {
  type PortItem,
  pickLoaderVersion,
  portedProjects,
  renameResourcePacks,
  renamedFiles,
} from "./portPlan";

const api = window.api;

export const PORT_VERSION_FAILED = "PORT_VERSION_FAILED";

const SETTINGS_ENTRIES = [
  "config",
  "defaultconfigs",
  "kubejs",
  "options.txt",
  "optionsof.txt",
  "optionsshaders.txt",
  "servers.dat",
];

export interface PortOptions {
  name: string;
  copySettings: boolean;
  copyWorlds: boolean;
}

export interface PortResult {
  instance: Version;
  blocked: string[];
  copyFailed: boolean;
}

async function copyEntries(
  from: string,
  to: string,
  entries: string[],
): Promise<boolean> {
  let ok = true;

  for (const entry of entries) {
    const source = api.path.join(from, entry);
    if (!(await api.fs.pathExists(source))) continue;
    if (!(await api.fs.copy(source, api.path.join(to, entry)))) ok = false;
  }

  return ok;
}

async function renamePacksInOptions(
  versionPath: string,
  renames: ReadonlyMap<string, string>,
): Promise<boolean> {
  if (renames.size === 0) return true;

  const optionsPath = api.path.join(versionPath, "options.txt");
  if (!(await api.fs.pathExists(optionsPath))) return true;

  const options = await api.fs.readFile(optionsPath, "utf-8").catch(() => null);
  if (options === null) return false;

  const renamed = renameResourcePacks(options, renames);
  if (renamed === options) return true;

  return await api.fs.writeFile(optionsPath, renamed, "utf-8");
}

export async function runPort(
  source: Version,
  target: PortTarget,
  items: PortItem[],
  options: PortOptions,
): Promise<PortResult> {
  const catalog = await api.versions.getList(target.loader, true).catch(() => null);
  const minecraftVersion = catalog?.find(
    (version) => version.id === target.minecraftVersion,
  );
  const loaderVersion =
    minecraftVersion && target.loader !== "vanilla"
      ? pickLoaderVersion(
          (await api.versions
            .getLoaderVersions(target.loader, minecraftVersion.id)
            .catch(() => null)) ?? [],
          target.loader,
        )
      : undefined;

  if (!minecraftVersion || (target.loader !== "vanilla" && !loaderVersion)) {
    throw new Error(PORT_VERSION_FAILED);
  }

  const name = options.name.trim();
  const versionPath = api.path.join(
    getDefaultStore().get(pathsAtom).minecraft,
    "versions",
    name,
  );
  const checked = await checkBlockedMods(portedProjects(items), versionPath);
  const blockedKeys = new Set(
    checked.blockedMods.map((blocked) => blocked.projectId),
  );
  const mods = checked.mods.filter((mod) => !blockedKeys.has(mod.id));
  const blocked = checked.mods
    .filter((mod) => blockedKeys.has(mod.id))
    .map((mod) => mod.title);

  const { instance } = await createInstance({
    name,
    image: source.version.image,
    loader: target.loader,
    loaderVersion,
    minecraftVersion,
    mods,
    servers: [],
    options: "",
    runArguments: source.version.runArguments,
    quickServer: source.version.quickServer ?? "",
    pack: null,
    blockedMods: [],
  });

  const entries = [
    ...(options.copySettings ? SETTINGS_ENTRIES : []),
    ...(options.copyWorlds ? ["saves"] : []),
  ];
  let copyFailed = !(await copyEntries(
    source.versionPath,
    instance.versionPath,
    entries,
  ));

  if (options.copySettings) {
    const renames = renamedFiles(
      source.version.loader.mods ?? [],
      items,
      ProjectType.RESOURCEPACK,
    );
    if (!(await renamePacksInOptions(instance.versionPath, renames))) {
      copyFailed = true;
    }
  }

  return { instance, blocked, copyFailed };
}
