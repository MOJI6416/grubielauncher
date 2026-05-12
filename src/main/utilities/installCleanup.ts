import path from "path";

export function normalizeInstallResourcePath(targetPath: string) {
  return path.resolve(targetPath).toLowerCase();
}

export function getUnusedInstallResourcePaths(
  resourcePaths: string[],
  usedByOtherVersionPaths: Iterable<string>,
) {
  const usedByOtherVersions = new Set(
    Array.from(usedByOtherVersionPaths, normalizeInstallResourcePath),
  );
  const seen = new Set<string>();
  const unused: string[] = [];

  for (const resourcePath of resourcePaths) {
    const key = normalizeInstallResourcePath(resourcePath);
    if (seen.has(key) || usedByOtherVersions.has(key)) continue;

    seen.add(key);
    unused.push(resourcePath);
  }

  return unused;
}

export function shouldCleanupCancelledInstall(cleanupOnCancel?: boolean) {
  return cleanupOnCancel === true;
}
