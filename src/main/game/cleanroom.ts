import path from "path";
import fs from "fs-extra";
import type { IVersionManifest } from "@/types/IVersionManifest";
import type { LoaderVersion } from "@/types/VersionsService";
import {
  cleanroomInstallerVersion,
  cleanroomManifestId,
  cleanroomUniversalEntry,
} from "@/shared/cleanroom";
import {
  extractZipEntries,
  readEntryData,
  withArchive,
} from "../utilities/archiver";
import { getSha1 } from "../utilities/files";

const INSTALLER_LIMITS = {
  maxArchiveBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
};

export function assertCleanroomBuild(build: LoaderVersion): LoaderVersion {
  if (cleanroomInstallerVersion(build.url) !== build.id) {
    throw new Error(`Refused untrusted Cleanroom download url: ${String(build.url)}`);
  }
  return build;
}

export function nativeFileName(classifier: {
  path?: string;
  url?: string;
}): string | null {
  if (classifier.path) return classifier.path.split("/").pop() || null;
  if (!classifier.url) return null;
  try {
    return (
      decodeURIComponent(new URL(classifier.url).pathname.split("/").pop() ?? "") ||
      null
    );
  } catch {
    return null;
  }
}

export function hasCleanroomLayer(
  manifest: IVersionManifest | undefined,
  loaderVersionId: string,
): boolean {
  return manifest?.id === cleanroomManifestId(loaderVersionId);
}

export function cleanroomUniversalLibrary(
  manifest: IVersionManifest,
  version: string,
): { path: string; sha1: string } | null {
  const name = `com.cleanroommc:cleanroom:${version}:universal`;
  const artifact = (manifest.libraries ?? []).find((library) => library.name === name)
    ?.downloads?.artifact;
  return artifact?.path ? { path: artifact.path, sha1: artifact.sha1 ?? "" } : null;
}

export function parseCleanroomManifest(
  raw: unknown,
  version: string,
): IVersionManifest {
  const manifest = raw as IVersionManifest;
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.id !== cleanroomManifestId(version) ||
    typeof manifest.mainClass !== "string" ||
    !Array.isArray(manifest.libraries) ||
    !manifest.downloads?.client?.url ||
    !manifest.assetIndex?.url
  ) {
    throw new Error(`Cleanroom ${version} installer has an unexpected version.json`);
  }
  if (!cleanroomUniversalLibrary(manifest, version)) {
    throw new Error(`Cleanroom ${version} installer does not list its universal jar`);
  }
  return manifest;
}

export async function readCleanroomInstaller(
  installerPath: string,
  version: string,
  librariesPath: string,
): Promise<IVersionManifest> {
  const manifest = await withArchive(
    installerPath,
    async (archive) => {
      const entry = archive.getEntry("version.json");
      if (!entry) throw new Error(`Cleanroom ${version} installer has no version.json`);
      return parseCleanroomManifest(
        JSON.parse((await readEntryData(entry)).toString("utf-8")),
        version,
      );
    },
    INSTALLER_LIMITS,
  );

  const universal = cleanroomUniversalLibrary(manifest, version);
  if (!universal) throw new Error(`Cleanroom ${version} universal jar is missing`);

  const target = path.join(librariesPath, ...universal.path.split("/"));
  const wanted = cleanroomUniversalEntry(version);
  const current = (await fs.pathExists(target))
    ? await getSha1(target).catch(() => "")
    : "";

  if (!universal.sha1 || current.toLowerCase() !== universal.sha1.toLowerCase()) {
    await fs.ensureDir(path.dirname(target));
    const extracted = await extractZipEntries(
      installerPath,
      (entryName) => (entryName === wanted ? target : null),
      INSTALLER_LIMITS,
    );
    if (extracted === 0) {
      throw new Error(`Cleanroom ${version} installer has no universal jar`);
    }
    if (universal.sha1) {
      const sha1 = await getSha1(target);
      if (sha1.toLowerCase() !== universal.sha1.toLowerCase()) {
        await fs.remove(target).catch(() => undefined);
        throw new Error(`Cleanroom ${version} universal jar failed its checksum`);
      }
    }
  }

  return manifest;
}
