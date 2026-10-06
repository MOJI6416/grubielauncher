import { compareLoaderVersions } from "@/shared/loaderCompat";

export type ServerCompatibility = "match" | "mismatch" | "unknown";

const VERSION_PATTERN = /\d+\.\d+(?:\.\d+)?/g;
const RANGE_PATTERN = /(\d+\.\d+(?:\.\d+)?)\s*[-–]\s*(\d+\.\d+(?:\.\d+)?)/g;

function inRange(version: string, low: string, high: string): boolean {
  return (
    compareLoaderVersions(version, low) >= 0 &&
    compareLoaderVersions(version, high) <= 0
  );
}

export function extractVersions(value: string | undefined): string[] {
  if (!value) return [];
  return value.match(VERSION_PATTERN) ?? [];
}

export function checkServerCompatibility(
  serverVersionName: string | undefined,
  instanceVersion: string | undefined,
): ServerCompatibility {
  if (!serverVersionName || !instanceVersion) return "unknown";

  const found = extractVersions(serverVersionName);
  if (!found.length) return "unknown";

  if (found.some((version) => version === instanceVersion)) return "match";

  for (const [, low, high] of serverVersionName.matchAll(RANGE_PATTERN)) {
    if (inRange(instanceVersion, low, high)) return "match";
  }

  const [major, minor] = instanceVersion.split(".");
  const family = `${major}.${minor}`;

  if (found.some((version) => version === family)) return "match";
  if (instanceVersion === family && found.some((v) => v.startsWith(`${family}.`))) {
    return "match";
  }

  return "mismatch";
}
