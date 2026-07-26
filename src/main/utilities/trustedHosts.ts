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

const SERVER_CORE_HOST_SUFFIXES = [
  ...TRUSTED_DOWNLOAD_HOST_SUFFIXES,
  "papermc.io",
  "purpurmc.org",
  "spigotmc.org",
  "getbukkit.org",
  "mctimemachine.com",
] as const;

export function isTrustedServerCoreUrl(url: unknown): url is string {
  if (typeof url !== "string" || url === "") return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  return SERVER_CORE_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function assertTrustedServerCoreUrl(url: string): string {
  if (!isTrustedServerCoreUrl(url)) {
    throw new Error(`Refused untrusted server core url: ${String(url)}`);
  }
  return url;
}

const LEGACY_FORGE_MAVEN_HOSTS = ["files.minecraftforge.net"];

export function normalizeLoaderLibraryUrl(url: string): string {
  if (typeof url !== "string" || !url) return url;

  let normalized = url.replace(/^http:\/\//i, "https://");

  for (const host of LEGACY_FORGE_MAVEN_HOSTS) {
    normalized = normalized.replace(
      new RegExp(`^https://${host.replace(/\./g, "\\.")}`, "i"),
      "https://maven.minecraftforge.net",
    );
  }

  return normalized.replace(/([^:])\/{2,}/g, "$1/");
}
