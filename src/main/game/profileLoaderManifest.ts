import type { IVersionManifest } from "@/types/IVersionManifest";
import type { IFabricManifest } from "@/types/IFabricManifest";
import { normalizeLoaderLibraryUrl } from "../utilities/trustedHosts";
import { ornitheIntermediaryGeneration } from "@/shared/profileLoaders";

type Library = IVersionManifest["libraries"][number];

type ProfileLibrary = IFabricManifest["libraries"][number];
type ProfileDownload = NonNullable<ProfileLibrary["downloads"]>["artifact"];

const DEFAULT_MAVEN = "https://libraries.minecraft.net/";

export function mavenJarPath(name: string, classifier?: string): string {
  const [group, artifact, version] = name.split("@")[0].split(":");
  if (!group || !artifact || !version) return "";

  const suffix = classifier ? `-${classifier}` : "";
  return `${group.replace(/\./g, "/")}/${artifact}/${version}/${artifact}-${version}${suffix}.jar`;
}

function joinUrl(base: string, relative: string): string {
  return `${base.replace(/\/+$/, "")}/${relative}`;
}

function toDownload(
  given: ProfileDownload | undefined,
  base: string,
  fallbackPath: string,
  fallback: { sha1?: string; size?: number } = {},
) {
  const path = given?.path || fallbackPath;
  return {
    url: normalizeLoaderLibraryUrl(given?.url || joinUrl(base, path)),
    path,
    sha1: given?.sha1 ?? fallback.sha1 ?? "",
    size: given?.size ?? fallback.size ?? 0,
  };
}

export function toManifestLibrary(library: ProfileLibrary): Library {
  const base = library.url || DEFAULT_MAVEN;

  if (library.natives) {
    const classifiers: Record<string, ReturnType<typeof toDownload>> = {};
    const given = library.downloads?.classifiers ?? {};

    for (const raw of Object.values(library.natives)) {
      if (!raw) continue;
      const classifier = raw.replace("${arch}", "64");
      if (classifiers[classifier]) continue;
      classifiers[classifier] = toDownload(
        given[classifier],
        base,
        mavenJarPath(library.name, classifier),
      );
    }

    return {
      name: library.name,
      natives: library.natives,
      downloads: { classifiers },
      ...(library.rules ? { rules: library.rules } : {}),
    } as unknown as Library;
  }

  return {
    name: library.name,
    downloads: {
      artifact: toDownload(
        library.downloads?.artifact,
        base,
        mavenJarPath(library.name),
        library,
      ),
    },
    ...(library.rules ? { rules: library.rules } : {}),
  };
}

export function libraryDownloadUrls(library: Library): string[] {
  const downloads = (library as { downloads?: Partial<Library["downloads"]> })
    .downloads;
  return [
    downloads?.artifact?.url,
    ...Object.values(downloads?.classifiers ?? {}).map((item) => item?.url),
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
}

function libraryKey(name: string): string {
  const [group = "", artifact = "", , classifier = ""] = name
    .split("@")[0]
    .split(":");
  return `${group}:${artifact}:${classifier}`;
}

const ASM_GROUP = "org.ow2.asm:";

export function replaceVanillaLibraries(
  profile: Library[],
  vanilla: Library[],
): Library[] {
  const replaced = new Set(profile.map((library) => libraryKey(library.name)));
  const bringsAsm = profile.some((library) =>
    library.name.startsWith(ASM_GROUP),
  );

  return [
    ...profile,
    ...vanilla.filter(
      (library) =>
        !replaced.has(libraryKey(library.name)) &&
        !(bringsAsm && library.name.startsWith(ASM_GROUP)),
    ),
  ];
}

export function completeOrnitheProfile(
  profile: IFabricManifest,
  intermediary: string | null,
  upgrades: readonly ProfileLibrary[],
): IFabricManifest {
  const libraries = profile.libraries.map((library) =>
    intermediary && ornitheIntermediaryGeneration([library.name]) !== undefined
      ? { name: intermediary, url: library.url }
      : library,
  );

  const present = new Set(libraries.map((library) => libraryKey(library.name)));
  for (const upgrade of upgrades) {
    if (present.has(libraryKey(upgrade.name))) continue;
    present.add(libraryKey(upgrade.name));
    libraries.push({ name: upgrade.name, url: upgrade.url });
  }

  return { ...profile, libraries };
}

export function profileJvmArguments(
  args: unknown[] | undefined,
  legacyManifest: boolean,
): string[] {
  const strings = (args ?? []).filter(
    (arg): arg is string => typeof arg === "string",
  );
  if (!legacyManifest) return strings;

  const result: string[] = [];
  for (let index = 0; index < strings.length; index++) {
    const arg = strings[index];
    if (arg === "-cp" || arg === "-classpath") {
      index++;
      continue;
    }
    if (arg.startsWith("-Djava.library.path=")) continue;
    result.push(arg);
  }

  return result;
}
