import { ProjectType } from "@/types/ModManager";

interface CountableProject {
  projectType?: ProjectType;
}

export function countContent(mods?: CountableProject[] | null): number {
  return mods?.length ?? 0;
}

export function countMods(mods?: CountableProject[] | null): number {
  if (!mods) return 0;

  return mods.filter(
    (mod) => (mod.projectType ?? ProjectType.MOD) === ProjectType.MOD,
  ).length;
}

export interface LaunchStatistics {
  lastLaunched?: string | number | Date | null;
  launches?: number | null;
}

export function instanceLastLaunch(
  confLastLaunch: string | number | Date | null | undefined,
  statistics?: LaunchStatistics | null,
): Date | null {
  return resolveLastLaunch(
    statistics?.lastLaunched,
    confLastLaunch,
    statistics?.launches,
  );
}

export function resolveLastLaunch(
  lastLaunched?: string | number | Date | null,
  fallback?: string | number | Date | null,
  launches?: number | null,
): Date | null {
  if (launches === 0) return null;

  let latest: Date | null = null;

  for (const value of [lastLaunched, fallback]) {
    if (value === null || value === undefined || value === "") continue;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) continue;

    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }

  return latest;
}
