import type { LoaderVersion } from "@/types/VersionsService";

export const CLEANROOM_MINECRAFT_VERSION = "1.12.2";

export const CLEANROOM_JAVA_MAJOR = 25;

const MAVEN = "https://maven.cleanroommc.com/com/cleanroommc/cleanroom";

export const CLEANROOM_MAVEN_METADATA_URL = `${MAVEN}/maven-metadata.xml`;

const VERSION_ID = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;
const OLDEST_SUPPORTED: [number, number] = [0, 7];
const INSTALLER_URL =
  /^https:\/\/maven\.cleanroommc\.com\/com\/cleanroommc\/cleanroom\/([0-9A-Za-z][0-9A-Za-z._+-]*)\/cleanroom-([0-9A-Za-z][0-9A-Za-z._+-]*)-installer\.jar$/;

export function cleanroomInstallerUrl(version: string): string {
  return `${MAVEN}/${version}/cleanroom-${version}-installer.jar`;
}

export function cleanroomUniversalEntry(version: string): string {
  return `maven/com/cleanroommc/cleanroom/${version}/cleanroom-${version}-universal.jar`;
}

export function cleanroomManifestId(version: string): string {
  return `Cleanroom-${version}`;
}

export function cleanroomInstallerVersion(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const match = INSTALLER_URL.exec(url);
  return match && match[1] === match[2] ? match[1] : null;
}

function numbers(id: string): number[] {
  return id
    .split("-")[0]
    .split(".")
    .map((part) => Number(part));
}

export function isSupportedCleanroomVersion(id: string): boolean {
  if (!VERSION_ID.test(id)) return false;
  const [major, minor] = numbers(id);
  return (
    major > OLDEST_SUPPORTED[0] ||
    (major === OLDEST_SUPPORTED[0] && minor >= OLDEST_SUPPORTED[1])
  );
}

function compareDescending(left: string, right: string): number {
  const a = numbers(left);
  const b = numbers(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.includes("-") === right.includes("-")
    ? 0
    : left.includes("-")
      ? 1
      : -1;
}

export function listCleanroomVersions(metadata: unknown): LoaderVersion[] {
  if (typeof metadata !== "string") return [];

  const ids = new Set<string>();
  for (const match of metadata.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)) {
    const id = match[1];
    if (isSupportedCleanroomVersion(id)) ids.add(id);
  }

  return [...ids]
    .sort(compareDescending)
    .map((id) => ({ id, url: cleanroomInstallerUrl(id) }));
}

export function contentLoaderOf<T extends string | undefined>(loader: T): T | "forge" {
  return loader === "cleanroom" ? "forge" : loader;
}

const CLEANROOM_MARKERS = /cleanroom|top\.outlands\.foundation/i;

export function isCleanroomComponent(
  component: { uid?: string; version?: string; cachedName?: string },
  patchText = "",
): boolean {
  const uid = component.uid?.toLowerCase() ?? "";
  if (uid.startsWith("com.cleanroommc")) return true;
  if (uid !== "net.minecraftforge") return false;
  if (CLEANROOM_MARKERS.test(component.cachedName ?? "")) return true;
  if (CLEANROOM_MARKERS.test(patchText)) return true;

  return /^0\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(component.version ?? "");
}
