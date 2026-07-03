const TRUSTED_DOWNLOAD_HOST_SUFFIXES = [
  "mojang.com",
  "minecraft.net",
  "fabricmc.net",
  "quiltmc.org",
  "minecraftforge.net",
  "neoforged.net",
  "grubielauncher.com",
] as const;

export function isTrustedDownloadUrl(url: unknown): url is string {
  if (typeof url !== "string" || url === "") return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  return TRUSTED_DOWNLOAD_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function assertTrustedDownloadUrl(
  url: string,
  label = "download url",
): string {
  if (!isTrustedDownloadUrl(url)) {
    throw new Error(`Refused untrusted ${label}: ${String(url)}`);
  }
  return url;
}
