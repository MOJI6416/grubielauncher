import { DownloadSource } from "@/types/Settings";

export const MIRROR_BASE = "https://mirror.grubielauncher.com";
export const MIRROR_BASE_DIRECT = "https://direct-mirror.grubielauncher.com";

const HOST_TO_PREFIX: Record<string, string> = {
  "piston-meta.mojang.com": "piston-meta",
  "piston-data.mojang.com": "piston-data",
  "libraries.minecraft.net": "libraries",
  "resources.download.minecraft.net": "assets",
  "maven.minecraftforge.net": "maven-forge",
  "maven.neoforged.net": "maven-neoforge",
  "maven.fabricmc.net": "maven-fabric",
  "maven.quiltmc.org": "maven-quilt",
  "meta.fabricmc.net": "meta-fabric",
  "meta.quiltmc.org": "meta-quilt",
  "api.adoptium.net": "adoptium-api",
  "cdn.modrinth.com": "modrinth",
  "edge.forgecdn.net": "forgecdn",
  "mediafilez.forgecdn.net": "forgecdn",
  "cdn.grubielauncher.com": "storage",
};

const TEMURIN_RELEASE_PATH = /^\/adoptium\/[^/]+-binaries\/releases\/download\//i;

export function toMirrorUrl(
  rawUrl: string,
  base: string = MIRROR_BASE,
): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();

  if (host === "github.com" && TEMURIN_RELEASE_PATH.test(url.pathname)) {
    return `${base}/temurin${url.pathname}${url.search}`;
  }

  const prefix = HOST_TO_PREFIX[host];
  if (!prefix) return null;

  return `${base}/${prefix}${url.pathname}${url.search}`;
}

const R2_UPLOAD_HOST = /\.r2\.cloudflarestorage\.com$/i;

export function toStorageUploadUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!R2_UPLOAD_HOST.test(url.hostname)) return null;

  return `${MIRROR_BASE_DIRECT}/storage-upload${url.pathname}${url.search}`;
}

export function resolveDownloadCandidates(
  rawUrl: string,
  source: DownloadSource,
  mojangReachable: boolean | null,
  mirrorDisabled = false,
): string[] {
  const mirror = toMirrorUrl(rawUrl);
  if (!mirror) return [rawUrl];

  if (source === "official") return [rawUrl];

  const ordered =
    source === "mirror"
      ? mirrorDisabled
        ? [rawUrl, mirror]
        : [mirror, rawUrl]
      : mojangReachable === false && !mirrorDisabled
        ? [mirror, rawUrl]
        : [rawUrl, mirror];

  const direct = toMirrorUrl(rawUrl, MIRROR_BASE_DIRECT);
  return direct ? [...ordered, direct] : ordered;
}
