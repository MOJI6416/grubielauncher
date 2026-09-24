import path from "path";
import fs from "fs-extra";
import { ILocalProject, ProjectType } from "@/types/ModManager";
import { writeJsonAtomic } from "../utilities/atomicJson";

export type ManagedFiles = Partial<Record<ProjectType, string[]>>;

const MANAGED_FILES_NAME = "managed-files.json";
const DISABLED_SUFFIX = /\.disabled$/i;

export const MANAGED_TYPES: ProjectType[] = [
  ProjectType.MOD,
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
  ProjectType.PLUGIN,
];

export function managedFilesPath(versionPath: string): string {
  return path.join(versionPath, "storage", MANAGED_FILES_NAME);
}

export function enabledFileName(name: string): string {
  return name.replace(DISABLED_SUFFIX, "");
}

function isManagedType(value: string): value is ProjectType {
  return (MANAGED_TYPES as string[]).includes(value);
}

function normalizeManaged(value: unknown): ManagedFiles | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const result: ManagedFiles = {};
  for (const [type, names] of Object.entries(value)) {
    if (!isManagedType(type) || !Array.isArray(names)) continue;
    result[type] = names.filter(
      (name): name is string => typeof name === "string" && name !== "",
    );
  }

  return result;
}

export function managedNamesFromMods(
  mods: ILocalProject[] | undefined,
): ManagedFiles {
  const result: ManagedFiles = {};

  for (const mod of mods ?? []) {
    if (!mod?.version || !isManagedType(mod.projectType)) continue;

    for (const file of mod.version.files ?? []) {
      if (!file?.filename || file.isClient === false) continue;
      const names = (result[mod.projectType] ??= []);
      const name = enabledFileName(file.filename);
      if (!names.includes(name)) names.push(name);
    }
  }

  return result;
}

export function mergeManaged(...sources: ManagedFiles[]): ManagedFiles {
  const result: ManagedFiles = {};

  for (const source of sources) {
    for (const type of MANAGED_TYPES) {
      const names = source[type];
      if (!names?.length) continue;
      const merged = new Set([...(result[type] ?? []), ...names]);
      result[type] = [...merged];
    }
  }

  return result;
}

async function readSavedConfMods(
  versionPath: string,
): Promise<ILocalProject[] | null> {
  const conf = await fs
    .readJSON(path.join(versionPath, "version.json"))
    .catch(() => null);
  const mods = conf?.loader?.mods;
  return Array.isArray(mods) ? mods : null;
}

export async function readManagedFiles(
  versionPath: string,
): Promise<ManagedFiles | null> {
  const stored = normalizeManaged(
    await fs.readJSON(managedFilesPath(versionPath)).catch(() => null),
  );
  if (stored) return stored;

  const savedMods = await readSavedConfMods(versionPath);
  return savedMods ? managedNamesFromMods(savedMods) : null;
}

export async function writeManagedFiles(
  versionPath: string,
  managed: ManagedFiles,
): Promise<void> {
  await fs.ensureDir(path.dirname(managedFilesPath(versionPath)));
  await writeJsonAtomic(managedFilesPath(versionPath), managed, { spaces: 2 });
}

export function isForeignFile(
  fileName: string,
  tracked: ReadonlySet<string>,
  managed: ReadonlySet<string> | null,
): boolean {
  const name = enabledFileName(fileName);
  if (tracked.has(name)) return false;
  if (!managed) return false;
  return !managed.has(name);
}
