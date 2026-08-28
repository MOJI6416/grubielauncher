import { normalizeInstancePath } from "./instancePrivacy";

export const WORLDS_ROOT = "saves";

export const WORLD_PRIVATE_DIRECTORIES = [
  "playerdata",
  "stats",
  "advancements",
] as const;

export const WORLD_PRIVATE_FILES = ["session.lock"] as const;

export const WORLD_LEVEL_FILES = ["level.dat", "level.dat_old"] as const;

export function isWorldsPath(relativePath: string): boolean {
  const normalized = normalizeInstancePath(relativePath);
  return normalized === WORLDS_ROOT || normalized.startsWith(`${WORLDS_ROOT}/`);
}

function worldRelativeSegments(relativePath: string): string[] | null {
  const normalized = normalizeInstancePath(relativePath);
  if (!normalized.startsWith(`${WORLDS_ROOT}/`)) return null;

  const segments = normalized.slice(WORLDS_ROOT.length + 1).split("/");
  return segments.length > 1 ? segments.slice(1) : [];
}

export function isPrivateWorldPath(relativePath: string): boolean {
  const inside = worldRelativeSegments(relativePath);
  if (!inside || inside.length === 0) return false;

  const [head] = inside;
  if (
    inside.length === 1 &&
    WORLD_PRIVATE_FILES.includes(head as (typeof WORLD_PRIVATE_FILES)[number])
  ) {
    return true;
  }

  return WORLD_PRIVATE_DIRECTORIES.includes(
    head as (typeof WORLD_PRIVATE_DIRECTORIES)[number],
  );
}

export function isWorldLevelDataPath(relativePath: string): boolean {
  const inside = worldRelativeSegments(relativePath);
  if (!inside || inside.length !== 1) return false;

  return WORLD_LEVEL_FILES.includes(
    inside[0] as (typeof WORLD_LEVEL_FILES)[number],
  );
}

export function splitWorldPaths(paths: readonly string[]): {
  worldPaths: string[];
  otherPaths: string[];
} {
  const worldPaths: string[] = [];
  const otherPaths: string[] = [];

  for (const item of paths) {
    if (isWorldsPath(item)) worldPaths.push(item);
    else otherPaths.push(item);
  }

  return { worldPaths, otherPaths };
}

export function getWorldFolderFromPath(relativePath: string): string | null {
  const normalized = normalizeInstancePath(relativePath);
  if (!normalized.startsWith(`${WORLDS_ROOT}/`)) return null;

  const [folder] = normalized.slice(WORLDS_ROOT.length + 1).split("/");
  return folder || null;
}

export function hasPublishedWorld(
  other?: { paths?: string[]; world?: boolean; [key: string]: unknown } | null,
): boolean {
  if (!other) return false;
  if (other.world === true) return true;

  return (other.paths || []).some(isWorldsPath);
}
