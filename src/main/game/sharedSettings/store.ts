import fs from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";
import { getDataRoot } from "../../utilities/dataRoot";
import { isSharedGroup, type SharedGroup } from "@/types/SharedSettings";
import type { ProfileOptions } from "./optionsMerge";
import type { ServerMark } from "./serverMerge";

export const PROFILE_FOLDER = "shared-game-settings";
export const INSTANCE_FOLDER = path.join("storage", "shared-settings");

export const SERVERS_FILE = "servers.dat";
export const HOTBAR_FILE = "hotbar.nbt";
export const HISTORY_FILE = "command_history.txt";
export const OPTIONS_FILE = "options.txt";
export const PACKS_FOLDER = "resourcepacks";

export interface ProfileData {
  v: 1;
  autoConnect: boolean;
  options: ProfileOptions;
  packs: string[];
  hotbarDataVersion: number | null;
}

export interface InstanceState {
  v: 1;
  connected: boolean;
  off: SharedGroup[];
  adopt: boolean;
  synced: boolean;
  shareLinked?: boolean;
  mc?: string;
  options?: Record<string, string>;
  servers?: ServerMark[];
  localServers?: string[];
  packs?: string[];
  appliedPacks?: string[];
  localPacks?: string[];
  hotbar?: string | null;
  history?: string[];
}

export function profileDir(): string {
  return path.join(getDataRoot(), PROFILE_FOLDER);
}

export function profilePath(...parts: string[]): string {
  return path.join(profileDir(), ...parts);
}

export function instanceStateDir(versionPath: string): string {
  return path.join(versionPath, INSTANCE_FOLDER);
}

export function backupPath(versionPath: string, ...parts: string[]): string {
  return path.join(instanceStateDir(versionPath), "backup", ...parts);
}

export async function writeFileAtomic(
  file: string,
  data: string | Buffer,
): Promise<void> {
  await fs.ensureDir(path.dirname(file));
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, data);
    await fs.move(temp, file, { overwrite: true });
  } catch (error) {
    await fs.remove(temp).catch(() => undefined);
    throw error;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function emptyProfile(): ProfileData {
  return {
    v: 1,
    autoConnect: true,
    options: {},
    packs: [],
    hotbarDataVersion: null,
  };
}

function sanitizeOptions(value: unknown): ProfileOptions {
  if (!value || typeof value !== "object") return {};
  const result: ProfileOptions = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const option = entry as Partial<ProfileOptions[string]> | null;
    if (
      option &&
      typeof option.value === "string" &&
      typeof option.mc === "string" &&
      typeof option.at === "number"
    ) {
      result[key] = { value: option.value, mc: option.mc, at: option.at };
    }
  }
  return result;
}

export async function readProfile(): Promise<ProfileData> {
  const raw = await fs
    .readJSON(profilePath("profile.json"))
    .catch(() => null as unknown);
  if (!raw || typeof raw !== "object") return emptyProfile();
  const data = raw as Partial<ProfileData>;
  return {
    v: 1,
    autoConnect: data.autoConnect !== false,
    options: sanitizeOptions(data.options),
    packs: strings(data.packs),
    hotbarDataVersion:
      typeof data.hotbarDataVersion === "number"
        ? data.hotbarDataVersion
        : null,
  };
}

export async function writeProfile(data: ProfileData): Promise<void> {
  await writeFileAtomic(
    profilePath("profile.json"),
    JSON.stringify(data, null, 2),
  );
}

export async function readInstanceState(
  versionPath: string,
): Promise<InstanceState | null> {
  const raw = await fs
    .readJSON(path.join(instanceStateDir(versionPath), "state.json"))
    .catch(() => null as unknown);
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<InstanceState>;
  return {
    ...(data as InstanceState),
    v: 1,
    connected: data.connected === true,
    off: strings(data.off).filter(isSharedGroup),
    adopt: data.adopt === true,
    synced: data.synced === true,
  };
}

export async function writeInstanceState(
  versionPath: string,
  state: InstanceState,
): Promise<void> {
  await writeFileAtomic(
    path.join(instanceStateDir(versionPath), "state.json"),
    JSON.stringify(state, null, 2),
  );
}

let queue: Promise<unknown> = Promise.resolve();

export function withProfileLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
