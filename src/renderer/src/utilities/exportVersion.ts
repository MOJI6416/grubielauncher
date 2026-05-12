import type { IVersionConf } from "@/types/IVersion";

export const EXPORT_EXCLUDED_TOP_LEVEL = new Set([
  "statistics.json",
  "logs",
  "crash-reports",
  "temp",
  "natives",
]);

export function getLocalPathFromFileUrl(url?: string) {
  if (!url?.startsWith("file://")) return "";

  const rawPath = url.slice("file://".length).split("?")[0];
  const normalizedPath = /^\/[a-zA-Z]:/.test(rawPath)
    ? rawPath.slice(1)
    : rawPath;

  try {
    return decodeURIComponent(normalizedPath);
  } catch {
    return normalizedPath;
  }
}

export function sanitizeExportVersion(version: IVersionConf): IVersionConf {
  return {
    ...version,
    owner: undefined,
    downloadedVersion: false,
    shareCode: undefined,
    loader: {
      ...version.loader,
      mods: version.loader.mods.map((mod) => ({
        ...mod,
        version: mod.version
          ? {
              ...mod.version,
              files: mod.version.files.map((file) => {
                const portableFile = { ...file };
                delete portableFile.localPath;
                if (portableFile.url?.startsWith("file://")) {
                  portableFile.url = "";
                }

                return portableFile;
              }),
            }
          : mod.version,
      })),
    },
  };
}
