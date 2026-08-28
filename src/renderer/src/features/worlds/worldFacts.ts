import { IWorld } from "@/types/World";

export const MAX_WORLD_NAME_LENGTH = 64;
const TICKS_PER_DAY = 24000;

export function worldAgeDays(ticks?: number): number | null {
  if (!ticks || !Number.isFinite(ticks) || ticks <= 0) return null;
  return Math.max(1, Math.floor(ticks / TICKS_PER_DAY));
}

export function formatSpawn(spawn?: IWorld["spawn"]): string | null {
  if (!spawn) return null;

  const parts = [spawn.x, spawn.y, spawn.z];
  if (parts.some((value) => !Number.isFinite(value))) return null;

  return parts.map((value) => Math.round(value)).join(" ");
}

export function isWorldNameValid(name: string, taken: string[]): boolean {
  const trimmed = name.trim();

  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_WORLD_NAME_LENGTH &&
    !taken.includes(trimmed)
  );
}

export function nextAvailableName(desired: string, taken: string[]): string {
  const base = desired.trim().slice(0, MAX_WORLD_NAME_LENGTH).trim();
  const used = new Set(taken);

  if (base && !used.has(base)) return base;

  for (let index = 2; index < 1000; index += 1) {
    const suffix = ` (${index})`;
    const candidate = `${base.slice(0, MAX_WORLD_NAME_LENGTH - suffix.length).trim()}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  return base;
}

export interface BackupFreshness {
  losesProgress: boolean;
  deltaMs: number;
}

export function backupFreshness(
  backupCreatedAt: number,
  worldLastPlayed?: number,
): BackupFreshness | null {
  if (!backupCreatedAt || !worldLastPlayed) return null;

  const deltaMs = worldLastPlayed - backupCreatedAt;

  return {
    losesProgress: deltaMs > 60_000,
    deltaMs: Math.abs(deltaMs),
  };
}

export function isWorldVersionMismatch(
  worldVersion: string | undefined,
  instanceVersion: string | undefined,
): boolean {
  if (!worldVersion || !instanceVersion) return false;
  return worldVersion.trim() !== instanceVersion.trim();
}

export function splitDatapacks(
  folderEntries: string[],
  enabled?: string[],
  disabled?: string[],
): { name: string; state: "enabled" | "disabled" | "unknown" }[] {
  const enabledSet = new Set((enabled ?? []).map(normalizeDatapackId));
  const disabledSet = new Set((disabled ?? []).map(normalizeDatapackId));

  return folderEntries.map((name) => {
    const id = normalizeDatapackId(name);

    if (enabledSet.has(id)) return { name, state: "enabled" as const };
    if (disabledSet.has(id)) return { name, state: "disabled" as const };

    return { name, state: "unknown" as const };
  });
}

function normalizeDatapackId(value: string): string {
  return value
    .replace(/^file\//, "")
    .replace(/^"|"$/g, "")
    .replace(/\.zip$/i, "")
    .trim()
    .toLowerCase();
}
