export type ModrinthDownloadReason =
  | "standalone"
  | "dependency"
  | "modpack"
  | "update";

export const MODRINTH_DOWNLOAD_REASONS: ModrinthDownloadReason[] = [
  "standalone",
  "dependency",
  "modpack",
  "update",
];

export const MODRINTH_META_HEADER = "modrinth-download-meta";

export interface ModrinthDownloadMeta {
  reason: ModrinthDownloadReason;
  gameVersion?: string;
  loader?: string;
}

const TAG_PATTERN = /^[A-Za-z0-9._+-]{1,64}$/;

export function isModrinthDownloadReason(
  value: unknown,
): value is ModrinthDownloadReason {
  return (MODRINTH_DOWNLOAD_REASONS as unknown[]).includes(value);
}

export function isModrinthCdnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname === "cdn.modrinth.com") return true;
    return (
      /^(direct-)?mirror\.grubielauncher\.com$/.test(parsed.hostname) &&
      parsed.pathname.startsWith("/modrinth/")
    );
  } catch {
    return false;
  }
}

export function modrinthMetaHeader(meta: ModrinthDownloadMeta): string {
  const value: Record<string, string> = { reason: meta.reason };
  if (meta.gameVersion && TAG_PATTERN.test(meta.gameVersion)) {
    value.game_version = meta.gameVersion;
  }
  if (meta.loader && TAG_PATTERN.test(meta.loader)) value.loader = meta.loader;
  return JSON.stringify(value);
}

export function modrinthLoaderTag(
  loader: string | undefined,
  projectType: string,
): string | undefined {
  if (projectType === "resourcepack") return "minecraft";
  if (projectType === "datapack") return "datapack";
  if (projectType !== "mod" && projectType !== "plugin") return undefined;
  if (!loader || loader === "vanilla") return undefined;
  return loader;
}

export function downloadReasonFor(input: {
  explicit?: ModrinthDownloadReason;
  operation?: string;
  fromModpack: boolean;
}): ModrinthDownloadReason {
  if (input.explicit) return input.explicit;
  if (input.operation === "install" && input.fromModpack) return "modpack";
  return "standalone";
}
