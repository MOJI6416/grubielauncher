export const BTA_MINECRAFT_VERSION = "b1.7.3";

const BTA_RELEASES =
  "https://downloads.betterthanadventure.net/bta-client/release";

export const BTA_VERSIONS_URL = `${BTA_RELEASES}/versions-new.json`;

export interface BtaVersionsIndex {
  versions?: Record<string, { release?: string } | undefined>;
}

export const BTA_VANILLA_JAR = "minecraft-b1.7.3-vanilla.jar";

export const BTA_VANILLA_CLIENT = {
  url: "https://launcher.mojang.com/v1/objects/43db9b498cb67058d2e12d394e6507722e71bb45/client.jar",
  sha1: "43db9b498cb67058d2e12d394e6507722e71bb45",
  size: 1465375,
};

export function shipsOwnClientJar(loader: unknown): boolean {
  return loader === "bta-babric";
}

export function btaManifestUrl(id: string): string {
  return `${BTA_RELEASES}/${id}/manifest.json`;
}

export function hasBtaLauncherManifest(id: string): boolean {
  const match = /^v(\d+)\.(\d+)/.exec(id);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 7 || (major === 7 && minor >= 3);
}

export function btaJavaMajor(id: string): number {
  const major = Number(/^v(\d+)\./.exec(id)?.[1] ?? 0);
  return major >= 8 ? 17 : 8;
}

export function listBtaVersions(index: BtaVersionsIndex): string[] {
  return Object.entries(index.versions ?? {})
    .filter(([id]) => hasBtaLauncherManifest(id))
    .sort(([, left], [, right]) =>
      (right?.release ?? "").localeCompare(left?.release ?? ""),
    )
    .map(([id]) => id);
}
