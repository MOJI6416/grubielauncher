// Minecraft version -> required Java major version. Mojang only ships the
// `javaVersion` field in the version manifest for 1.17+, so older versions
// (which run on Java 8) must be resolved from the version string. Used as a
// fallback whenever the manifest does not carry javaVersion.
export function mcVersionToJavaMajor(mcVersion: string): number {
  const match = /^1\.(\d+)/.exec(mcVersion ?? "");
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
