import type { IVersionManifest } from "@/types/IVersionManifest";
import type { LoaderVersion } from "@/types/VersionsService";
import { FOXLOADER_MAIN_CLASS, foxLoaderJarVersion } from "@/shared/foxLoader";

const LAUNCHWRAPPER_LIBRARIES =
  /^(?:net\.minecraft:launchwrapper|net\.sf\.jopt-simple:jopt-simple|org\.ow2\.asm:asm-all):/;

export function assertFoxLoaderBuild(build: LoaderVersion): LoaderVersion {
  if (foxLoaderJarVersion(build.url) !== build.id) {
    throw new Error(`Refused untrusted FoxLoader download url: ${String(build.url)}`);
  }
  return build;
}

export function applyFoxLoaderLayer(
  manifest: IVersionManifest,
  build: LoaderVersion,
): IVersionManifest {
  return {
    ...manifest,
    id: build.id,
    mainClass: FOXLOADER_MAIN_CLASS,
    libraries: manifest.libraries.filter(
      (library) => !LAUNCHWRAPPER_LIBRARIES.test(library.name),
    ),
    downloads: {
      ...manifest.downloads,
      client: { url: build.url, sha1: "", size: 0 },
    },
  };
}

export function hasFoxLoaderLayer(
  manifest: IVersionManifest | undefined,
  loaderVersionId: string,
): boolean {
  return (
    manifest?.mainClass === FOXLOADER_MAIN_CLASS && manifest.id === loaderVersionId
  );
}
