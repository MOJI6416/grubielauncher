import path from "path";
import fs from "fs-extra";

interface InstallerArtifact {
  path?: string;
  url?: string;
  sha1?: string;
  size?: number;
}

interface InstallerLibrary {
  name?: string;
  downloads?: { artifact?: InstallerArtifact };
}

interface InstallerProcessor {
  sides?: string[];
  args?: string[];
  outputs?: Record<string, string>;
}

export interface ModernInstallProfile {
  spec?: number;
  json?: string;
  libraries?: InstallerLibrary[];
  processors?: InstallerProcessor[];
  data?: Record<string, { client?: string; server?: string }>;
}

export interface SeedLibrary {
  path: string;
  url: string;
  sha1?: string;
  size?: number;
}

export function isModernInstallProfile(
  profile: unknown,
): profile is ModernInstallProfile {
  if (!profile || typeof profile !== "object") return false;
  const value = profile as ModernInstallProfile & { versionInfo?: unknown };
  return (
    !value.versionInfo &&
    (typeof value.spec === "number" || Array.isArray(value.processors))
  );
}

export function safeLibraryPath(relative: string | undefined): string | null {
  if (!relative || typeof relative !== "string") return null;
  const normalized = relative.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;
  if (normalized.split("/").some((part) => part === ".." || part === ""))
    return null;
  return normalized;
}

export function mavenArtifactPath(coordinate: string): string | null {
  const [main, extension = "jar"] = coordinate.split("@");
  const parts = main.split(":");
  if (parts.length < 3 || parts.length > 4) return null;
  const [group, artifact, version, classifier] = parts;
  if (!group || !artifact || !version) return null;
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ""}.${extension}`;
  return safeLibraryPath(
    `${group.replace(/\./g, "/")}/${artifact}/${version}/${file}`,
  );
}

export function collectInstallerLibraries(
  profile: ModernInstallProfile,
  versionJson: { libraries?: InstallerLibrary[] } | null,
): SeedLibrary[] {
  const byPath = new Map<string, SeedLibrary>();
  for (const library of [
    ...(profile.libraries ?? []),
    ...(versionJson?.libraries ?? []),
  ]) {
    const artifact = library?.downloads?.artifact;
    const relative = safeLibraryPath(artifact?.path);
    if (!relative || !artifact?.url || byPath.has(relative)) continue;
    byPath.set(relative, {
      path: relative,
      url: artifact.url,
      sha1: artifact.sha1 || undefined,
      size: artifact.size || undefined,
    });
  }
  return [...byPath.values()];
}

export function versionLibraryPaths(
  versionJson: { libraries?: InstallerLibrary[] } | null,
): string[] {
  const paths = new Set<string>();
  for (const library of versionJson?.libraries ?? []) {
    const relative = safeLibraryPath(library?.downloads?.artifact?.path);
    if (relative) paths.add(relative);
  }
  return [...paths];
}

export function safeVersionId(id: unknown): string | null {
  return typeof id === "string" &&
    /^[\w.+-]+$/.test(id) &&
    id !== ".." &&
    id !== "."
    ? id
    : null;
}

export function collectProcessorArtifacts(
  profile: ModernInstallProfile,
): string[] {
  const used = new Set<string>();
  for (const processor of profile.processors ?? []) {
    if (processor?.sides && !processor.sides.includes("client")) continue;
    const text = [
      ...(processor?.args ?? []),
      ...Object.entries(processor?.outputs ?? {}).flat(),
    ].join(" ");
    for (const match of text.matchAll(/\{([A-Z0-9_]+)\}/g)) used.add(match[1]);
  }

  const paths = new Set<string>();
  for (const [key, entry] of Object.entries(profile.data ?? {})) {
    if (!used.has(key)) continue;
    const match = /^\[(.+)\]$/.exec(entry?.client ?? "");
    const relative = match ? mavenArtifactPath(match[1]) : null;
    if (relative) paths.add(relative);
  }
  return [...paths];
}

export async function isSameFile(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    fs.stat(a, { bigint: true }).catch(() => null),
    fs.stat(b, { bigint: true }).catch(() => null),
  ]);
  return (
    !!left &&
    !!right &&
    left.isFile() &&
    left.ino === right.ino &&
    left.dev === right.dev
  );
}

export async function linkOrCopy(source: string, target: string) {
  await fs.ensureDir(path.dirname(target));
  await fs.remove(target).catch(() => {});
  try {
    await fs.link(source, target);
  } catch {
    await fs.copyFile(source, target);
  }
}
