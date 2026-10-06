import type { Loader } from "@/types/Loader";

export type ProfileLoader = Extract<
  Loader,
  "fabric" | "quilt" | "legacy-fabric" | "babric" | "ornithe"
>;

export type LegacyLoader = Extract<
  Loader,
  "legacy-fabric" | "babric" | "ornithe"
>;

const PROFILE_LOADER_META: Record<
  ProfileLoader,
  { base: string; loaderPath: string }
> = {
  fabric: {
    base: "https://meta.fabricmc.net/v2",
    loaderPath: "versions/loader",
  },
  quilt: { base: "https://meta.quiltmc.org/v3", loaderPath: "versions/loader" },
  "legacy-fabric": {
    base: "https://meta.legacyfabric.net/v2",
    loaderPath: "versions/loader",
  },
  babric: {
    base: "https://meta.babric.glass-launcher.net/v2",
    loaderPath: "versions/loader",
  },
  ornithe: {
    base: "https://meta.ornithemc.net/v3",
    loaderPath: "versions/fabric-loader",
  },
};

export const LEGACY_LOADERS: readonly LegacyLoader[] = [
  "legacy-fabric",
  "babric",
  "ornithe",
];

export function isProfileLoader(loader: unknown): loader is ProfileLoader {
  return (
    typeof loader === "string" &&
    Object.prototype.hasOwnProperty.call(PROFILE_LOADER_META, loader)
  );
}

export function isLegacyLoader(loader: unknown): loader is LegacyLoader {
  return LEGACY_LOADERS.includes(loader as LegacyLoader);
}

export function profileGameVersionsUrl(loader: ProfileLoader): string {
  return `${PROFILE_LOADER_META[loader].base}/versions/game`;
}

export function profileLoaderVersionsUrl(
  loader: ProfileLoader,
  minecraftVersion: string,
): string {
  const { base, loaderPath } = PROFILE_LOADER_META[loader];
  return `${base}/${loaderPath}/${minecraftVersion}`;
}

export function profileJsonUrl(
  loader: ProfileLoader,
  minecraftVersion: string,
  loaderVersion: string,
): string {
  if (loader === "ornithe") {
    const { version, generation } = splitOrnitheGeneration(loaderVersion);
    return `${ornitheLoaderVersionsUrl(minecraftVersion, generation)}/${version}/profile/json`;
  }

  return `${profileLoaderVersionsUrl(loader, minecraftVersion)}/${loaderVersion}/profile/json`;
}

export const ORNITHE_DEFAULT_GENERATION = 2;
export const ORNITHE_GENERATIONS = [2, 1] as const;

export interface OrnitheModsCheck {
  generation: number;
  target: number | null;
  mismatched: string[];
  compatible: string[];
}

const ORNITHE_GENERATION_SUFFIX = /\+gen(\d+)$/;

export function splitOrnitheGeneration(loaderVersion: string): {
  version: string;
  generation: number;
} {
  const match = ORNITHE_GENERATION_SUFFIX.exec(loaderVersion);
  return match
    ? {
        version: loaderVersion.slice(0, match.index),
        generation: Number(match[1]),
      }
    : { version: loaderVersion, generation: ORNITHE_DEFAULT_GENERATION };
}

export function ornitheLoaderVersionId(
  version: string,
  generation: number,
): string {
  return generation === ORNITHE_DEFAULT_GENERATION
    ? version
    : `${version}+gen${generation}`;
}

export function ornitheLoaderVersionsUrl(
  minecraftVersion: string,
  generation: number,
): string {
  return `${PROFILE_LOADER_META.ornithe.base}/versions/gen${generation}/fabric-loader/${minecraftVersion}`;
}

export function ornitheLibrariesUrl(
  minecraftVersion: string,
  generation: number,
): string {
  return `${PROFILE_LOADER_META.ornithe.base}/versions/gen${generation}/libraries/${minecraftVersion}`;
}

export function ornitheIntermediaryUrl(
  minecraftVersion: string,
  generation: number,
): string {
  return `${PROFILE_LOADER_META.ornithe.base}/versions/gen${generation}/intermediary/${minecraftVersion}`;
}

export const ORNITHE_MAVEN = "https://maven.ornithemc.net/releases";

const ORNITHE_INTERMEDIARY_LIBRARY =
  /^net\.ornithemc:calamus-intermediary(?:-gen(\d+))?:/;

export function ornitheIntermediaryGeneration(
  libraryNames: readonly string[],
): number | undefined {
  for (const name of libraryNames) {
    const match = ORNITHE_INTERMEDIARY_LIBRARY.exec(name);
    if (match) return match[1] ? Number(match[1]) : 1;
  }
  return undefined;
}

export function fabricFamilyFor(minecraftVersion: string): ProfileLoader {
  const id = minecraftVersion.trim();
  if (id === "b1.7.3") return "babric";

  const release = /^1\.(\d+)(?:\.|-|$)/.exec(id);
  if (release) {
    const minor = Number(release[1]);
    if (minor >= 14) return "fabric";
    return minor >= 3 ? "legacy-fabric" : "ornithe";
  }

  const snapshot = /^(\d{2})w(\d{2})/.exec(id);
  if (snapshot) {
    const year = Number(snapshot[1]);
    const week = Number(snapshot[2]);
    return year > 18 || (year === 18 && week >= 43) ? "fabric" : "ornithe";
  }

  return /^(?:a|b|c|inf-|in-|rd-)/.test(id) ? "ornithe" : "fabric";
}
