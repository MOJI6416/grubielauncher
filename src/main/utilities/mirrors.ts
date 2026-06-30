import { DownloadSource } from "@/types/Settings";

export const MIRROR_BASE = "https://mirror.grubielauncher.com";

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
};

export function toMirrorUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const prefix = HOST_TO_PREFIX[url.hostname.toLowerCase()];
  if (!prefix) return null;

  return `${MIRROR_BASE}/${prefix}${url.pathname}${url.search}`;
}

export function resolveDownloadCandidates(
  rawUrl: string,
  source: DownloadSource,
  mojangReachable: boolean | null,
): string[] {
  const mirror = toMirrorUrl(rawUrl);
  if (!mirror) return [rawUrl];

  if (source === "official") return [rawUrl];
  if (source === "mirror") return [mirror, rawUrl];

  return mojangReachable === false ? [mirror, rawUrl] : [rawUrl, mirror];
}
