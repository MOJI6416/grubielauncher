import type { IVersion } from "@/types/IVersion";

export type VersionKind = "release" | "snapshot" | "old";

export interface VersionEntry {
  id: string;
  kind: VersionKind;
  releaseTime: string | null;
  version: IVersion;
}

export interface VersionFilter {
  query: string;
  kinds: VersionKind[];
}

export function versionKind(type: string | undefined): VersionKind {
  if (type === "snapshot") return "snapshot";
  if (type === "old_beta" || type === "old_alpha") return "old";

  return "release";
}

function readReleaseTime(version: IVersion): string | null {
  const value = (version as { releaseTime?: unknown }).releaseTime;

  return typeof value === "string" && value.length > 0 ? value : null;
}

export function toVersionEntries(list: IVersion[]): VersionEntry[] {
  return list.map((version) => ({
    id: version.id,
    kind: versionKind(version.type),
    releaseTime: readReleaseTime(version),
    version,
  }));
}

export function countVersionKinds(
  entries: VersionEntry[],
): Record<VersionKind, number> {
  const counts: Record<VersionKind, number> = {
    release: 0,
    snapshot: 0,
    old: 0,
  };

  for (const entry of entries) counts[entry.kind] += 1;

  return counts;
}

export function filterVersionEntries(
  entries: VersionEntry[],
  filter: VersionFilter,
): VersionEntry[] {
  const needle = filter.query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (!filter.kinds.includes(entry.kind)) return false;
    if (!needle) return true;

    return entry.id.toLowerCase().includes(needle);
  });
}

export function pickDefaultVersion(
  entries: VersionEntry[],
  preferredId?: string,
): VersionEntry | undefined {
  if (preferredId) {
    const preferred = entries.find((entry) => entry.id === preferredId);
    if (preferred) return preferred;
  }

  return entries.find((entry) => entry.kind === "release") ?? entries[0];
}

export function formatReleaseDate(
  value: string | null,
  locale: string,
): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function versionAgeYears(
  value: string | null,
  now: number = Date.now(),
): number | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const years = (now - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  return years < 0 ? 0 : years;
}
