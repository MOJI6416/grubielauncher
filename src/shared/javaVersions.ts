// Minecraft version -> required Java major version. Mojang only ships the
// `javaVersion` field in the version manifest for 1.17+, so older versions
// (which run on Java 8) must be resolved from the version string. Used as a
// fallback whenever the manifest does not carry javaVersion.
const LEGACY_ID_PATTERN = /^(?:rd-|inf-|c0\.|a1\.|b1\.)/i;
const SNAPSHOT_ID_PATTERN = /^(\d{2})w(\d{2})/;

function snapshotToJavaMajor(mcVersion: string): number | null {
  const match = SNAPSHOT_ID_PATTERN.exec(mcVersion);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);

  if (year >= 24) return 21;
  if (year >= 22) return 17;
  if (year === 21) return week >= 19 ? 17 : 8;
  return 8;
}

export function mcVersionToJavaMajor(mcVersion: string): number {
  const id = mcVersion ?? "";

  if (LEGACY_ID_PATTERN.test(id)) return 8;

  const snapshot = snapshotToJavaMajor(id);
  if (snapshot !== null) return snapshot;

  const match = /^1\.(\d+)/.exec(id);
  if (!match) return 21;

  const minor = Number(match[1]);
  if (minor <= 16) return 8;
  if (minor <= 19) return 17;
  if (minor === 20) {
    const patch = Number(/^1\.20\.(\d+)/.exec(mcVersion)?.[1] ?? "0");
    return patch >= 5 ? 21 : 17;
  }
  return 21;
}
