import { Loader } from "@/types/Loader";
import { ProjectType, Provider } from "@/types/ModManager";
import { IServerConf } from "@/types/Server";
import { LOADERS_WITHOUT_CURSEFORGE_MODS } from "@/shared/loaderCompat";
import { getProjectTypes } from "@renderer/utilities/mod";
import { catalogLoaderOptions } from "./catalogLoader";

export type CatalogProvider = Provider.CURSEFORGE | Provider.MODRINTH;

export const CATALOG_PROVIDERS: readonly CatalogProvider[] = [
  Provider.CURSEFORGE,
  Provider.MODRINTH,
];

export const BROWSE_PREFERENCE: readonly CatalogProvider[] = [
  Provider.MODRINTH,
  Provider.CURSEFORGE,
];

export type CatalogAvailability = "available" | "empty" | "unknown";

export interface CatalogTarget {
  loader: Loader | undefined;
  server: IServerConf | undefined;
  mcVersion: string | undefined;
}

const LEGACY_ID_PATTERN = /^(?:rd-|inf-|c0\.|a1\.|b1\.)/i;
const SNAPSHOT_ID_PATTERN = /^(\d{2})w(\d{2})/;
const RELEASE_ID_PATTERN = /^1\.(\d+)/;

export function supportsDatapacks(mcVersion: string | undefined): boolean {
  if (!mcVersion) return true;
  if (LEGACY_ID_PATTERN.test(mcVersion)) return false;

  const snapshot = SNAPSHOT_ID_PATTERN.exec(mcVersion);
  if (snapshot) {
    const year = Number(snapshot[1]);
    const week = Number(snapshot[2]);
    return year > 17 || (year === 17 && week >= 43);
  }

  const release = RELEASE_ID_PATTERN.exec(mcVersion);
  if (release) return Number(release[1]) >= 13;

  return true;
}

export function fittingTypes(
  provider: CatalogProvider,
  target: CatalogTarget,
): ProjectType[] {
  return getProjectTypes(target.loader ?? "vanilla", target.server, provider)
    .filter(
      (type) =>
        !(
          type === ProjectType.MOD &&
          provider === Provider.CURSEFORGE &&
          target.loader &&
          LOADERS_WITHOUT_CURSEFORGE_MODS.has(target.loader)
        ),
    )
    .filter(
      (type) =>
        type !== ProjectType.DATAPACK || supportsDatapacks(target.mcVersion),
    );
}

export function probeLoaders(
  type: ProjectType,
  target: CatalogTarget,
): (string | undefined)[] {
  if (type === ProjectType.PLUGIN && target.server) {
    return [target.server.core];
  }

  const options = catalogLoaderOptions(target.loader, type);
  return options.length > 0 ? options : [target.loader];
}

export function probeKey(
  provider: CatalogProvider,
  type: ProjectType,
  mcVersion: string | undefined,
  loader: string | undefined,
): string {
  return [provider, type, mcVersion ?? "", loader ?? ""].join("|");
}

export function combineProbes(
  results: readonly (number | null)[],
): CatalogAvailability {
  if (results.some((total) => total !== null && total > 0)) {
    return "available";
  }
  return results.length > 0 && results.every((total) => total === 0)
    ? "empty"
    : "unknown";
}

export type AvailabilityMap = Partial<
  Record<CatalogProvider, Partial<Record<ProjectType, CatalogAvailability>>>
>;

export function providerTypes(
  provider: CatalogProvider,
  target: CatalogTarget,
  availability: AvailabilityMap,
): ProjectType[] {
  return fittingTypes(provider, target).filter(
    (type) => availability[provider]?.[type] !== "empty",
  );
}

export function libraryTypes(
  target: CatalogTarget,
  availability: AvailabilityMap,
  installed: ReadonlyMap<ProjectType, number>,
): ProjectType[] {
  const offered = new Set(
    CATALOG_PROVIDERS.flatMap((provider) =>
      providerTypes(provider, target, availability),
    ),
  );

  return getProjectTypes(
    target.loader ?? "vanilla",
    target.server,
    Provider.CURSEFORGE,
  ).filter((type) => offered.has(type) || (installed.get(type) ?? 0) > 0);
}
