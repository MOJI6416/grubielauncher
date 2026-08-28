import type { IVersion } from "@/types/IVersion";
import type { IModpack as IImportedModpack } from "@/types/ModManager";
import type { LoaderVersion } from "@/types/VersionsService";
import { resolveImportedLoaderVersion } from "@/shared/loaderVersions";
import type { LoaderVersionIssue } from "./state";

const api = window.api;

export interface PackVersionResolution {
  minecraftVersion?: IVersion;
  loaderVersion?: LoaderVersion;
  loaderVersions: LoaderVersion[];
  issue: LoaderVersionIssue;
  catalogFailed: boolean;
  versionMissing: boolean;
}

export async function resolvePackVersions(
  pack: IImportedModpack,
): Promise<PackVersionResolution> {
  const empty: PackVersionResolution = {
    loaderVersions: [],
    issue: null,
    catalogFailed: false,
    versionMissing: false,
  };

  const loader = pack.loader;
  if (!loader || !pack.version) return empty;

  const catalog = await api.versions.getList(loader, true).catch(() => null);
  if (!catalog || catalog.length === 0) {
    return { ...empty, catalogFailed: true };
  }

  const minecraftVersion = catalog.find((entry) => entry.id === pack.version);
  if (!minecraftVersion) return { ...empty, versionMissing: true };

  if (loader === "vanilla") return { ...empty, minecraftVersion };

  const loaderVersions = await api.versions
    .getLoaderVersions(loader, minecraftVersion.id)
    .catch(() => null);

  if (!loaderVersions) return { ...empty, minecraftVersion, catalogFailed: true };

  const resolution = resolveImportedLoaderVersion({
    loader,
    minecraftVersion: minecraftVersion.id,
    requiredLoaderVersion: pack.loaderVersion,
    availableVersions: loaderVersions,
  });

  if (resolution.status === "matched" || resolution.status === "synthesized") {
    const known = loaderVersions.some(
      (entry) => entry.id === resolution.version.id,
    );

    return {
      ...empty,
      minecraftVersion,
      loaderVersion: resolution.version,
      loaderVersions: known
        ? loaderVersions
        : [resolution.version, ...loaderVersions],
    };
  }

  return {
    ...empty,
    minecraftVersion,
    loaderVersions,
    issue:
      resolution.status === "missingRequired" ? "missingRequired" : "notFound",
  };
}
