import os from "os";
import path from "path";
import fs from "fs-extra";
import { execFile } from "child_process";
import { parseRegQueryValue } from "@/shared/gpuPreference";
import {
  isDirectory,
  parseProperties,
  positiveMegabytes,
  readJsonFile,
  readTextFile,
  splitArguments,
} from "./common";
import type { RootOwner, VersionJson } from "./formats/vanilla";
import { hasOfficialLauncher, readLauncherProfiles } from "./formats/vanilla";

export interface LocateEnv {
  platform: NodeJS.Platform;
  home: string;
  appData?: string;
  localAppData?: string;
  xdgDataHome?: string;
  xdgConfigHome?: string;
  programFiles?: string[];
}

export type RootCandidate =
  | { kind: "mmc"; launcher: "prism" | "multimc"; root: string; instancesDir?: string }
  | { kind: "atlauncher"; root: string }
  | { kind: "gdlegacy"; root: string }
  | { kind: "gdcarbon"; root: string; runtime?: boolean }
  | { kind: "curseforge"; root: string; instancesDir?: string }
  | { kind: "modrinth"; root: string }
  | { kind: "minecraft"; root: string; owners: RootOwner[] };

export function systemEnv(): LocateEnv {
  return {
    platform: process.platform,
    home: os.homedir(),
    appData: process.env.APPDATA,
    localAppData: process.env.LOCALAPPDATA,
    xdgDataHome: process.env.XDG_DATA_HOME,
    xdgConfigHome: process.env.XDG_CONFIG_HOME,
    programFiles: [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(
      (value): value is string => !!value,
    ),
  };
}

export function dataDir(env: LocateEnv): string {
  if (env.platform === "win32") return env.appData ?? path.join(env.home, "AppData", "Roaming");
  if (env.platform === "darwin") return path.join(env.home, "Library", "Application Support");
  return env.xdgDataHome || path.join(env.home, ".local", "share");
}

function configDir(env: LocateEnv): string {
  if (env.platform === "win32") return dataDir(env);
  if (env.platform === "darwin") return path.join(env.home, "Library", "Application Support");
  return env.xdgConfigHome || path.join(env.home, ".config");
}

export function defaultMinecraftDir(env: LocateEnv): string {
  if (env.platform === "win32") return path.join(dataDir(env), ".minecraft");
  if (env.platform === "darwin") return path.join(dataDir(env), "minecraft");
  return path.join(env.home, ".minecraft");
}

export function tlauncherHome(env: LocateEnv): string {
  return env.platform === "darwin"
    ? path.join(dataDir(env), "tlauncher")
    : path.join(env.platform === "win32" ? dataDir(env) : env.home, ".tlauncher");
}

function minecraftStoreDir(env: LocateEnv): string | undefined {
  if (env.platform !== "win32" || !env.localAppData) return undefined;
  return path.join(
    env.localAppData,
    "Packages",
    "Microsoft.4297127D64EC6_8wekyb3d8bbwe",
    "LocalCache",
    "Roaming",
    ".minecraft",
  );
}

function multimcCandidates(env: LocateEnv): string[] {
  const data = dataDir(env);
  const list = [path.join(data, "multimc"), path.join(data, "MultiMC")];
  if (env.platform === "win32") {
    list.push(
      path.join(env.home, "MultiMC"),
      path.join(env.home, "Desktop", "MultiMC"),
      path.join(env.home, "Downloads", "MultiMC"),
      path.join(env.home, "Documents", "MultiMC"),
      "C:\\MultiMC",
      "C:\\Games\\MultiMC",
      ...(env.programFiles ?? []).map((root) => path.join(root, "MultiMC")),
    );
  }
  if (env.platform === "darwin") {
    list.push(
      "/Applications/MultiMC.app/Data",
      path.join(env.home, "Applications", "MultiMC.app", "Data"),
    );
  }
  return list;
}

export function staticCandidates(env: LocateEnv): RootCandidate[] {
  const data = dataDir(env);
  const list: RootCandidate[] = [
    { kind: "mmc", launcher: "prism", root: path.join(data, "PrismLauncher") },
    { kind: "mmc", launcher: "prism", root: path.join(data, "PolyMC") },
    ...multimcCandidates(env).map(
      (root): RootCandidate => ({ kind: "mmc", launcher: "multimc", root }),
    ),
    { kind: "atlauncher", root: path.join(data, "ATLauncher") },
    { kind: "gdlegacy", root: path.join(data, "gdlauncher_next") },
    { kind: "gdcarbon", root: path.join(data, "gdlauncher_carbon") },
    { kind: "curseforge", root: path.join(env.home, "curseforge", "minecraft") },
    { kind: "curseforge", root: path.join(env.home, "Documents", "curseforge", "minecraft") },
    { kind: "modrinth", root: path.join(data, "ModrinthApp") },
    { kind: "modrinth", root: path.join(data, "com.modrinth.theseus") },
  ];

  if (env.platform === "linux") {
    const flatpak = path.join(env.home, ".var", "app");
    list.push(
      {
        kind: "mmc",
        launcher: "prism",
        root: path.join(flatpak, "org.prismlauncher.PrismLauncher", "data", "PrismLauncher"),
      },
      { kind: "atlauncher", root: path.join(data, "atlauncher") },
      {
        kind: "atlauncher",
        root: path.join(flatpak, "com.atlauncher.ATLauncher", "data", "atlauncher"),
      },
    );
  }

  return list;
}

function runReg(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("reg.exe", args, { windowsHide: true, timeout: 5000 }, (error, stdout) =>
      resolve(error ? null : String(stdout ?? "")),
    );
  });
}

export async function curseForgeRootOverride(env: LocateEnv): Promise<string | undefined> {
  if (env.platform === "win32") {
    const output = await runReg(["query", "HKCU\\Software\\Overwolf\\CurseForge", "/v", "minecraft_root"]);
    const value = output ? parseRegQueryValue(output, "minecraft_root") : null;
    if (value) return value;
  }

  const storage = await readJsonFile<Record<string, unknown>>(
    path.join(configDir(env), "CurseForge", "storage.json"),
  );
  const raw = storage?.["minecraft-settings"];
  try {
    const settings = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : raw;
    const root =
      settings && typeof settings === "object"
        ? (settings as Record<string, unknown>).minecraftRoot
        : undefined;
    return typeof root === "string" && root.trim() ? root.trim() : undefined;
  } catch {
    return undefined;
  }
}

function legacySeparateMode(value: string | undefined): "none" | "family" | "version" {
  if (value === "true" || value === "family") return "family";
  if (value === "version") return "version";
  return "none";
}

function safeSegment(value: string): string | undefined {
  return value && !/[\\/]/.test(value) && value !== "." && value !== ".." ? value : undefined;
}

export function legacyOwner(
  settings: Record<string, string>,
  gameDir: string,
): RootOwner {
  const mode = legacySeparateMode(settings["minecraft.gamedir.separate"]);
  const memory = settings["minecraft.xmx"];
  return {
    launcher: "legacy",
    memoryMb: memory === "auto" ? undefined : positiveMegabytes(memory),
    jvmArgs: splitArguments(settings["minecraft.javaargs"]),
    gameDirFor:
      mode === "none"
        ? undefined
        : (versionId: string, json: VersionJson) => {
            const segment = safeSegment(
              mode === "version" ? versionId : typeof json.family === "string" ? json.family : "",
            );
            return segment ? path.join(gameDir, "home", segment) : undefined;
          },
  };
}

export function tlauncherOwner(settings: Record<string, string>, gameDir: string): RootOwner {
  return {
    launcher: "tlauncher",
    memoryMb: positiveMegabytes(settings["minecraft.memory.ram2"]),
    jvmArgs: splitArguments(settings["minecraft.javaargs"]),
    gameDirFor: (versionId: string, json: VersionJson) =>
      json.modpack !== undefined && json.modpack !== null && json.modpack !== false
        ? path.join(gameDir, "versions", versionId)
        : undefined,
  };
}

async function readSettings(file: string): Promise<Record<string, string> | null> {
  const text = await readTextFile(file);
  return text === null ? null : parseProperties(text);
}

async function legacySettingsFiles(home: string): Promise<string[]> {
  const files = [path.join(home, "legacy.properties")];
  const entries = await fs.readdir(home, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
  for (const entry of entries) {
    if (entry.isDirectory()) files.push(path.join(home, entry.name, "Minecraft", "tl.properties"));
  }
  return files;
}

function gameDirFromSettings(
  settings: Record<string, string>,
  settingsFile: string,
  fallback: string,
): string {
  const value = settings["minecraft.gamedir"]?.trim();
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(path.dirname(settingsFile), value);
}

export async function minecraftCandidates(env: LocateEnv): Promise<RootCandidate[]> {
  const owners = new Map<string, { root: string; owners: RootOwner[] }>();
  const add = (root: string, owner: RootOwner) => {
    const key = path.resolve(root).toLowerCase();
    const entry = owners.get(key) ?? { root, owners: [] };
    if (!entry.owners.some((existing) => existing.launcher === owner.launcher)) {
      entry.owners.push(owner);
    }
    owners.set(key, entry);
  };

  const defaultDir = defaultMinecraftDir(env);
  const home = tlauncherHome(env);

  const tlSettingsFile = path.join(home, "tlauncher-2.0.properties");
  const tlSettings = await readSettings(tlSettingsFile);
  if (tlSettings) {
    const gameDir = gameDirFromSettings(tlSettings, tlSettingsFile, defaultDir);
    add(gameDir, tlauncherOwner(tlSettings, gameDir));
  }

  for (const file of await legacySettingsFiles(home)) {
    const settings = await readSettings(file);
    if (!settings) continue;
    const gameDir = gameDirFromSettings(settings, file, defaultDir);
    add(gameDir, legacyOwner(settings, gameDir));
  }

  for (const root of [defaultDir, minecraftStoreDir(env)]) {
    if (!root || !(await isDirectory(root))) continue;
    const profiles = await readLauncherProfiles(root);
    const known = owners.has(path.resolve(root).toLowerCase());
    if (!known || (await hasOfficialLauncher(root, profiles))) {
      add(root, { launcher: "official" });
    }
  }

  return [...owners.values()].map(
    (entry): RootCandidate => ({ kind: "minecraft", root: entry.root, owners: entry.owners }),
  );
}
