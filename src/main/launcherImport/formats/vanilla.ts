import path from "path";
import fs from "fs-extra";
import type { ForeignLauncher } from "@/types/LauncherImport";
import type { Loader } from "@/types/Loader";
import {
  type ForeignInstance,
  listDirectories,
  memoryFromArgs,
  readJsonFile,
  splitArguments,
  stripMinecraftVersion,
  timestampOf,
} from "../common";

export interface VersionJson {
  id?: string;
  inheritsFrom?: string;
  type?: string;
  family?: string;
  jar?: string;
  tlauncherVersion?: unknown;
  modpack?: unknown;
  source?: unknown;
  libraries?: { name?: string }[];
  arguments?: { game?: unknown[] };
  minecraftArguments?: string;
}

export interface LauncherProfile {
  name?: string;
  type?: string;
  lastVersionId?: string;
  gameDir?: string;
  javaArgs?: string;
  icon?: string;
  lastUsed?: string;
}

export interface VersionLoader {
  minecraftVersion?: string;
  loader: Loader;
  loaderVersion?: string;
}

export type MinecraftLauncher = Extract<ForeignLauncher, "official" | "tlauncher" | "legacy">;

export interface RootOwner {
  launcher: MinecraftLauncher;
  memoryMb?: number;
  jvmArgs?: string[];
  gameDirFor?: (versionId: string, json: VersionJson) => string | undefined;
}

function libraryVersion(libraries: string[], prefix: string): string | undefined {
  const match = libraries.find((name) => name.startsWith(prefix));
  return match ? match.slice(prefix.length).split(":")[0] : undefined;
}

function gameArgument(json: VersionJson, name: string): string | undefined {
  const args = [
    ...(Array.isArray(json.arguments?.game)
      ? json.arguments.game.filter((arg): arg is string => typeof arg === "string")
      : []),
    ...splitArguments(json.minecraftArguments),
  ];
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function detectVersionLoader(json: VersionJson, parentId?: string): VersionLoader {
  const libraries = (json.libraries ?? [])
    .map((library) => library?.name)
    .filter((name): name is string => typeof name === "string");
  const jarVersion = typeof json.jar === "string" && json.jar !== json.id ? json.jar : undefined;
  const minecraftVersion =
    parentId ??
    gameArgument(json, "--fml.mcVersion") ??
    libraryVersion(libraries, "net.fabricmc:intermediary:") ??
    libraryVersion(libraries, "net.legacyfabric:intermediary:") ??
    libraryVersion(libraries, "org.quiltmc:hashed:") ??
    jarVersion;

  const quilt = libraryVersion(libraries, "org.quiltmc:quilt-loader:");
  if (quilt) return { minecraftVersion, loader: "quilt", loaderVersion: quilt };

  const fabric = libraryVersion(libraries, "net.fabricmc:fabric-loader:");
  if (fabric) {
    const legacy = libraries.some((name) => name.startsWith("net.legacyfabric"));
    return {
      minecraftVersion,
      loader: legacy ? "legacy-fabric" : "fabric",
      loaderVersion: fabric,
    };
  }

  const cleanroom = libraryVersion(libraries, "com.cleanroommc:cleanroom:");
  if (cleanroom) return { minecraftVersion, loader: "cleanroom", loaderVersion: cleanroom };

  const neoforge =
    gameArgument(json, "--fml.neoForgeVersion") ??
    libraryVersion(libraries, "net.neoforged:neoforge:");
  const neoforgeLegacy = libraryVersion(libraries, "net.neoforged:forge:");
  if (neoforge || neoforgeLegacy) {
    const mc = minecraftVersion ?? neoforgeLegacy?.split("-")[0];
    return {
      minecraftVersion: mc,
      loader: "neoforge",
      loaderVersion: neoforge ?? stripMinecraftVersion(neoforgeLegacy, mc ?? ""),
    };
  }

  const forgeLibrary =
    libraryVersion(libraries, "net.minecraftforge:forge:") ??
    libraryVersion(libraries, "net.minecraftforge:fmlloader:");
  const forgeArgument = gameArgument(json, "--fml.forgeVersion");
  if (forgeLibrary || forgeArgument) {
    const mc = minecraftVersion ?? forgeLibrary?.split("-")[0];
    return {
      minecraftVersion: mc,
      loader: "forge",
      loaderVersion: forgeArgument ?? stripMinecraftVersion(forgeLibrary, mc ?? ""),
    };
  }

  return { minecraftVersion: minecraftVersion ?? json.id, loader: "vanilla" };
}

function profileIcon(icon: string | undefined): string | undefined {
  return icon && /^data:image\/(?:png|jpeg|webp);base64,/i.test(icon) ? icon : undefined;
}

export async function readLauncherProfiles(root: string): Promise<LauncherProfile[]> {
  const data = await readJsonFile<{ profiles?: Record<string, LauncherProfile> }>(
    path.join(root, "launcher_profiles.json"),
  );
  return Object.values(data?.profiles ?? {}).filter(
    (profile): profile is LauncherProfile => !!profile && typeof profile === "object",
  );
}

const OFFICIAL_MARKERS = [
  "launcher_ui_state.json",
  "launcher_settings.json",
  "launcher_accounts.json",
  "launcher_accounts_microsoft_store.json",
  "launcher_product_state.json",
];

export async function hasOfficialLauncher(
  root: string,
  profiles: LauncherProfile[],
): Promise<boolean> {
  if (profiles.some((profile) => profile.type === "latest-release")) return true;
  for (const marker of OFFICIAL_MARKERS) {
    if (await fs.pathExists(path.join(root, marker))) return true;
  }
  return false;
}

export async function readVersionJsons(root: string): Promise<Map<string, VersionJson>> {
  const versions = new Map<string, VersionJson>();
  const versionsDir = path.join(root, "versions");
  for (const id of await listDirectories(versionsDir)) {
    const json = await readJsonFile<VersionJson>(path.join(versionsDir, id, `${id}.json`));
    if (json && typeof json === "object") versions.set(id, json);
  }
  return versions;
}

function resolveVersion(id: string, versions: Map<string, VersionJson>): VersionLoader | null {
  const json = versions.get(id);
  if (!json) return null;

  let parentId = json.inheritsFrom;
  const seen = new Set([id]);
  while (parentId && versions.get(parentId)?.inheritsFrom && !seen.has(parentId)) {
    seen.add(parentId);
    parentId = versions.get(parentId)?.inheritsFrom;
  }

  const detected = detectVersionLoader(json, parentId);
  return detected.minecraftVersion ? detected : null;
}

async function ownerOf(
  root: string,
  versionId: string,
  json: VersionJson,
  hasProfile: boolean,
  owners: RootOwner[],
): Promise<RootOwner> {
  const find = (launcher: MinecraftLauncher) =>
    owners.find((owner) => owner.launcher === launcher);
  const tlauncher = find("tlauncher");
  const legacy = find("legacy");
  const official = find("official");

  if (
    tlauncher &&
    (await fs.pathExists(path.join(root, "versions", versionId, "TLauncherAdditional.json")))
  ) {
    return tlauncher;
  }
  if (legacy && typeof json.family === "string") return legacy;
  if (json.tlauncherVersion !== undefined || json.modpack !== undefined) {
    const owner = tlauncher ?? legacy;
    if (owner) return owner;
  }
  if (hasProfile && official) return official;
  return official ?? owners[0];
}

export async function scanMinecraftRoot(
  root: string,
  owners: RootOwner[],
): Promise<ForeignInstance[]> {
  if (owners.length === 0) return [];
  const versions = await readVersionJsons(root);
  if (versions.size === 0) return [];

  const profiles = owners.some((owner) => owner.launcher === "official")
    ? await readLauncherProfiles(root)
    : [];
  const parents = new Set(
    [...versions.values()].map((json) => json.inheritsFrom).filter(Boolean),
  );

  const result: ForeignInstance[] = [];
  const seen = new Set<string>();

  const add = async (versionId: string, profile: LauncherProfile | undefined) => {
    const json = versions.get(versionId);
    if (!json) return;

    const detected = resolveVersion(versionId, versions);
    if (!detected?.minecraftVersion) return;

    const owner = await ownerOf(root, versionId, json, !!profile, owners);
    const customDir = profile?.gameDir?.trim();
    const gameDir =
      customDir && path.isAbsolute(customDir)
        ? customDir
        : (owner.gameDirFor?.(versionId, json) ?? root);
    const key = `${versionId}\0${path.resolve(gameDir).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    const shared = path.resolve(gameDir) === path.resolve(root);
    const instanceDir = path.join(root, "versions", versionId);
    const ownFolder = path.resolve(gameDir) === path.resolve(instanceDir);
    const profileArgs = splitArguments(profile?.javaArgs);
    const jvmArgs = profileArgs.length > 0 ? profileArgs : (owner.jvmArgs ?? []);
    const stat = await fs
      .stat(path.join(root, "versions", versionId, `${versionId}.json`))
      .catch(() => null);

    result.push({
      launcher: owner.launcher,
      root,
      name: profile?.name?.trim() || versionId,
      minecraftVersion: detected.minecraftVersion,
      loader: detected.loader,
      loaderVersion: detected.loaderVersion,
      gameDir,
      instanceDir,
      iconData: profileIcon(profile?.icon),
      memoryMb: memoryFromArgs(profileArgs) ?? owner.memoryMb ?? memoryFromArgs(jvmArgs),
      jvmArgs,
      lastPlayed: timestampOf(profile?.lastUsed) ?? stat?.mtimeMs,
      sharedGameDir: shared,
      skipMods: shared && detected.loader === "vanilla",
      ...(ownFolder
        ? {
            skipEntries: [
              `${versionId}.json`,
              `${versionId}.jar`,
              "TLauncherAdditional.json",
            ],
          }
        : {}),
    });
  };

  for (const profile of profiles) {
    const versionId = profile.lastVersionId?.trim();
    if (!versionId || profile.type === "latest-release" || profile.type === "latest-snapshot") {
      continue;
    }
    if (versions.has(versionId)) await add(versionId, profile);
  }

  const referenced = new Set(profiles.map((profile) => profile.lastVersionId));
  for (const versionId of versions.keys()) {
    if (referenced.has(versionId) || parents.has(versionId)) continue;
    await add(versionId, undefined);
  }

  return result;
}
