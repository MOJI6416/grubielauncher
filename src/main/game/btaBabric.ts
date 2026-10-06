import type { IVersionManifest } from "@/types/IVersionManifest";
import type { IFabricManifest } from "@/types/IFabricManifest";
import { openArchive, readEntryData } from "../utilities/archiver";
import { normalizeLoaderLibraryUrl } from "../utilities/trustedHosts";
import { mavenJarPath, toManifestLibrary } from "./profileLoaderManifest";

type Library = IVersionManifest["libraries"][number];
type ProfileLibrary = IFabricManifest["libraries"][number];

const TURNIP_RELEASES =
  "https://github.com/Turnip-Labs/bta-fabric-instance-repo/releases/download";

const LOADER_UID = "net.fabricmc.fabric-loader";
const MINECRAFT_UID = "net.minecraft";

interface PrismLibrary extends ProfileLibrary {
  "MMC-hint"?: string;
}

interface PrismPatch {
  libraries?: PrismLibrary[];
  "+libraries"?: PrismLibrary[];
  mainClass?: string;
  minecraftArguments?: string;
  compatibleJavaMajors?: number[];
}

interface PrismPack {
  components?: { uid?: string; version?: string; disabled?: boolean }[];
}

export interface BabricLayer {
  loaderVersion: string;
  mainClass: string;
  minecraftArguments?: string;
  javaMajor?: number;
  jvm: string[];
  libraries: Library[];
  localLibraries: { path: string; data: Buffer }[];
}

export function turnipInstanceUrls(btaVersion: string): string[] {
  const bare = btaVersion.replace(/^v/, "");
  return ["bta_fabric_instance", "bta_babric_instance"].map(
    (prefix) => `${TURNIP_RELEASES}/v${bare}/${prefix}_${bare}.zip`,
  );
}

function urlPath(url: string): string {
  return new URL(url).pathname.replace(/^\/+/, "");
}

export function instanceJvmProperties(instanceCfg: string): string[] {
  const line = instanceCfg
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("JvmArgs="));
  if (!line) return [];

  const value = line
    .slice("JvmArgs=".length)
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/\\"/g, '"');
  return value.split(/\s+/).filter((arg) => /^-D[\w.-]+=?/.test(arg));
}

function convertLibrary(
  library: PrismLibrary,
  readLocal: (file: string) => Buffer | null,
  localLibraries: BabricLayer["localLibraries"],
): Library | null {
  if (library["MMC-hint"] === "local") {
    const [, artifact, version] = library.name.split(":");
    const data = artifact && version ? readLocal(`${artifact}-${version}.jar`) : null;
    const path = mavenJarPath(library.name);
    if (!data || !path) return null;

    localLibraries.push({ path, data });
    return {
      name: library.name,
      downloads: { artifact: { path, url: "", sha1: "", size: data.length } },
    };
  }

  const artifact = library.downloads?.artifact;
  if (artifact?.url) {
    const url = normalizeLoaderLibraryUrl(artifact.url);
    return {
      name: library.name,
      downloads: {
        artifact: {
          url,
          path: artifact.path || urlPath(url),
          sha1: artifact.sha1 ?? "",
          size: artifact.size ?? 0,
        },
      },
      ...(library.rules ? { rules: library.rules } : {}),
    };
  }

  return toManifestLibrary(library);
}

export async function readTurnipInstance(zipPath: string): Promise<BabricLayer> {
  const archive = await openArchive(zipPath);
  const entries = new Map(
    archive
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => [entry.entryName.replace(/\\/g, "/"), entry]),
  );

  const packName = [...entries.keys()]
    .filter((name) => name.endsWith("mmc-pack.json"))
    .sort((left, right) => left.length - right.length)[0];
  if (!packName) throw new Error("BTA instance has no mmc-pack.json");
  const root = packName.slice(0, -"mmc-pack.json".length);

  const read = async (name: string) => {
    const entry = entries.get(root + name);
    return entry ? await readEntryData(entry) : null;
  };
  const readJson = async <T>(name: string): Promise<T | null> => {
    const data = await read(name);
    return data ? (JSON.parse(data.toString("utf-8")) as T) : null;
  };

  const pack = await readJson<PrismPack>("mmc-pack.json");
  const components = (pack?.components ?? []).filter(
    (component) => component.uid && component.disabled !== true,
  );
  const loaderVersion = components.find((component) => component.uid === LOADER_UID)
    ?.version;
  if (!loaderVersion) throw new Error("BTA instance has no Fabric Loader");

  const localFiles = new Map<string, Buffer>();
  for (const [name, entry] of entries) {
    if (name.startsWith(`${root}libraries/`) && !name.slice(root.length + 10).includes("/")) {
      localFiles.set(name.slice(root.length + 10), await readEntryData(entry));
    }
  }

  const layer: BabricLayer = {
    loaderVersion,
    mainClass: "",
    jvm: instanceJvmProperties((await read("instance.cfg"))?.toString("utf-8") ?? ""),
    libraries: [],
    localLibraries: [],
  };

  for (const component of components) {
    const patch = await readJson<PrismPatch>(`patches/${component.uid}.json`);
    if (!patch) continue;

    for (const library of [...(patch.libraries ?? []), ...(patch["+libraries"] ?? [])]) {
      const converted = convertLibrary(
        library,
        (file) => localFiles.get(file) ?? null,
        layer.localLibraries,
      );
      if (converted) layer.libraries.push(converted);
    }

    if (patch.mainClass) layer.mainClass = patch.mainClass;
    if (component.uid === MINECRAFT_UID) {
      layer.minecraftArguments = patch.minecraftArguments;
      layer.javaMajor = patch.compatibleJavaMajors?.[0];
    }
  }

  if (!layer.mainClass) throw new Error("BTA instance has no main class");
  return layer;
}

export function applyBabricLayer(
  manifest: IVersionManifest,
  layer: BabricLayer,
): IVersionManifest {
  return {
    ...manifest,
    mainClass: layer.mainClass,
    minecraftArguments: layer.minecraftArguments ?? manifest.minecraftArguments,
    javaVersion: layer.javaMajor
      ? { component: manifest.javaVersion?.component ?? "", majorVersion: layer.javaMajor }
      : manifest.javaVersion,
    libraries: layer.libraries,
    arguments: layer.jvm.length > 0 ? { game: [], jvm: layer.jvm } : manifest.arguments,
  };
}

export function hasBabricLayer(manifest: IVersionManifest | undefined): boolean {
  return (manifest?.libraries ?? []).some((library) =>
    /:fabric-loader:/.test(library.name),
  );
}
