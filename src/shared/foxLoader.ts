import type { LoaderVersion } from "@/types/VersionsService";
import { shipsOwnClientJar } from "./btaLoader";

export const FOXLOADER_MINECRAFT_VERSION = "b1.7.3";

export const FOXLOADER_MAIN_CLASS = "com.fox2code.foxloader.launcher.ClientMain";

export const FOXLOADER_RELEASES_URL =
  "https://api.github.com/repos/Fox2Code/FoxLoader/releases?per_page=100";

const MAVEN_LOADER = "https://cdn.fox2code.com/maven/com/fox2code/FoxLoader/loader";

export const FOXLOADER_MAVEN_METADATA_URL = `${MAVEN_LOADER}/maven-metadata.xml`;

const RELEASE_JAR_URL =
  /^https:\/\/github\.com\/Fox2Code\/FoxLoader\/releases\/download\/([0-9A-Za-z][0-9A-Za-z._+-]*)\/[0-9A-Za-z][0-9A-Za-z._+-]*\.jar$/;
const MAVEN_JAR_URL =
  /^https:\/\/cdn\.fox2code\.com\/maven\/com\/fox2code\/FoxLoader\/loader\/([0-9A-Za-z][0-9A-Za-z._+-]*)\/loader-([0-9A-Za-z][0-9A-Za-z._+-]*)\.jar$/;
const VERSION_ID = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,127}$/;
const SUPPORTED_MAJOR = 2;

interface FoxLoaderAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

interface FoxLoaderRelease {
  tag_name?: unknown;
  draft?: unknown;
  assets?: unknown;
}

export function replacesClientJar(loader: unknown): boolean {
  return shipsOwnClientJar(loader) || loader === "foxloader";
}

export function foxLoaderJarVersion(url: unknown): string | null {
  if (typeof url !== "string") return null;

  const release = RELEASE_JAR_URL.exec(url);
  if (release) return release[1];

  const maven = MAVEN_JAR_URL.exec(url);
  return maven && maven[1] === maven[2] ? maven[1] : null;
}

function isSupportedVersion(id: string): boolean {
  return VERSION_ID.test(id) && Number(/^(\d+)\./.exec(id)?.[1]) === SUPPORTED_MAJOR;
}

function clientJarOf(release: FoxLoaderRelease, id: string): string | null {
  const assets = Array.isArray(release.assets)
    ? (release.assets as FoxLoaderAsset[])
    : [];
  const byName = new Map(
    assets
      .filter(
        (asset) =>
          typeof asset?.name === "string" &&
          typeof asset.browser_download_url === "string",
      )
      .map((asset) => [
        String(asset.name).toLowerCase(),
        String(asset.browser_download_url),
      ]),
  );

  const name = id.toLowerCase();
  const url =
    byName.get(`foxloader-${name}.jar`) ??
    byName.get(`foxloader-${name}-installer.jar`);
  return url && foxLoaderJarVersion(url) === id ? url : null;
}

export function listFoxLoaderVersions(releases: unknown): LoaderVersion[] {
  if (!Array.isArray(releases)) return [];

  const versions: LoaderVersion[] = [];
  for (const release of releases as FoxLoaderRelease[]) {
    if (!release || release.draft === true) continue;

    const id = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
    if (!isSupportedVersion(id)) continue;

    const url = clientJarOf(release, id);
    if (url && !versions.some((version) => version.id === id)) {
      versions.push({ id, url });
    }
  }

  return versions;
}

export function foxLoaderMavenVersion(metadata: unknown): LoaderVersion | null {
  if (typeof metadata !== "string") return null;

  const id = /<release>\s*([^<\s]+)\s*<\/release>/.exec(metadata)?.[1] ?? "";
  if (!isSupportedVersion(id)) return null;

  return { id, url: `${MAVEN_LOADER}/${id}/loader-${id}.jar` };
}
