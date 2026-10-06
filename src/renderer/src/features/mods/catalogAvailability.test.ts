import { describe, expect, it } from "vitest";
import { ProjectType, Provider } from "@/types/ModManager";
import { IServerConf, ServerCore } from "@/types/Server";
import {
  AvailabilityMap,
  CatalogTarget,
  combineProbes,
  fittingTypes,
  libraryTypes,
  probeLoaders,
  providerTypes,
  supportsDatapacks,
} from "./catalogAvailability";

function target(
  loader: CatalogTarget["loader"],
  mcVersion: string,
  server?: IServerConf,
): CatalogTarget {
  return { loader, mcVersion, server };
}

describe("supportsDatapacks", () => {
  it("accepts 1.13 and newer, calendar versions and late snapshots", () => {
    expect(supportsDatapacks("1.13")).toBe(true);
    expect(supportsDatapacks("1.21.1")).toBe(true);
    expect(supportsDatapacks("26.3")).toBe(true);
    expect(supportsDatapacks("17w43a")).toBe(true);
    expect(supportsDatapacks("25w14a")).toBe(true);
  });

  it("rejects versions from before datapacks existed", () => {
    expect(supportsDatapacks("1.12.2")).toBe(false);
    expect(supportsDatapacks("1.7.10")).toBe(false);
    expect(supportsDatapacks("b1.7.3")).toBe(false);
    expect(supportsDatapacks("a1.2.6")).toBe(false);
    expect(supportsDatapacks("17w42a")).toBe(false);
  });

  it("does not hide datapacks when the version is unknown", () => {
    expect(supportsDatapacks(undefined)).toBe(true);
  });
});

describe("fittingTypes", () => {
  it("never offers worlds on Modrinth", () => {
    expect(
      fittingTypes(Provider.MODRINTH, target("fabric", "1.21.1")),
    ).not.toContain(ProjectType.WORLD);
    expect(
      fittingTypes(Provider.CURSEFORGE, target("fabric", "1.21.1")),
    ).toContain(ProjectType.WORLD);
  });

  it("drops CurseForge mods for loaders CurseForge does not host", () => {
    for (const loader of ["babric", "ornithe", "bta-babric"] as const) {
      expect(
        fittingTypes(Provider.CURSEFORGE, target(loader, "b1.7.3")),
      ).not.toContain(ProjectType.MOD);
      expect(
        fittingTypes(Provider.MODRINTH, target(loader, "b1.7.3")),
      ).toContain(ProjectType.MOD);
    }
    expect(
      fittingTypes(Provider.CURSEFORGE, target("legacy-fabric", "1.12.2")),
    ).toContain(ProjectType.MOD);
  });

  it("drops datapacks for old game versions", () => {
    expect(
      fittingTypes(Provider.MODRINTH, target("forge", "1.12.2")),
    ).not.toContain(ProjectType.DATAPACK);
    expect(
      fittingTypes(Provider.MODRINTH, target("vanilla", "1.20.1")),
    ).toContain(ProjectType.DATAPACK);
  });

  it("offers plugins only for plugin servers", () => {
    const paper = { core: ServerCore.PAPER } as IServerConf;
    expect(
      fittingTypes(Provider.MODRINTH, target("vanilla", "1.21.1", paper)),
    ).toContain(ProjectType.PLUGIN);
    expect(
      fittingTypes(Provider.MODRINTH, target("vanilla", "1.21.1")),
    ).not.toContain(ProjectType.PLUGIN);
  });
});

describe("probeLoaders", () => {
  it("probes every loader the catalog lets the player switch to", () => {
    expect(
      probeLoaders(ProjectType.MOD, target("legacy-fabric", "1.12.2")),
    ).toEqual(["legacy-fabric", "fabric"]);
    expect(probeLoaders(ProjectType.MOD, target("babric", "b1.7.3"))).toEqual([
      "babric",
    ]);
    expect(
      probeLoaders(ProjectType.RESOURCEPACK, target("fabric", "1.21.1")),
    ).toEqual(["fabric"]);
  });

  it("probes plugins with the server core", () => {
    const paper = { core: ServerCore.PAPER } as IServerConf;
    expect(
      probeLoaders(ProjectType.PLUGIN, target("vanilla", "1.21.1", paper)),
    ).toEqual([ServerCore.PAPER]);
  });
});

describe("combineProbes", () => {
  it("is available when any probe found something", () => {
    expect(combineProbes([0, 3])).toBe("available");
    expect(combineProbes([null, 1])).toBe("available");
  });

  it("is empty only when every probe answered zero", () => {
    expect(combineProbes([0, 0])).toBe("empty");
    expect(combineProbes([0, null])).toBe("unknown");
    expect(combineProbes([])).toBe("unknown");
  });
});

describe("providerTypes and libraryTypes", () => {
  const beta = target("babric", "b1.7.3");
  const probed: AvailabilityMap = {
    [Provider.CURSEFORGE]: {
      [ProjectType.RESOURCEPACK]: "empty",
      [ProjectType.SHADER]: "empty",
      [ProjectType.WORLD]: "empty",
    },
    [Provider.MODRINTH]: {
      [ProjectType.MOD]: "available",
      [ProjectType.RESOURCEPACK]: "available",
      [ProjectType.SHADER]: "empty",
    },
  };

  it("leaves a provider with nothing for the instance empty", () => {
    expect(providerTypes(Provider.CURSEFORGE, beta, probed)).toEqual([]);
    expect(providerTypes(Provider.MODRINTH, beta, probed)).toEqual([
      ProjectType.MOD,
      ProjectType.RESOURCEPACK,
    ]);
  });

  it("keeps types in the library while something is installed", () => {
    expect(libraryTypes(beta, probed, new Map())).toEqual([
      ProjectType.MOD,
      ProjectType.RESOURCEPACK,
    ]);
    expect(
      libraryTypes(beta, probed, new Map([[ProjectType.SHADER, 2]])),
    ).toEqual([ProjectType.MOD, ProjectType.RESOURCEPACK, ProjectType.SHADER]);
  });

  it("shows every fitting type until probes answer", () => {
    expect(providerTypes(Provider.CURSEFORGE, beta, {})).toEqual([
      ProjectType.RESOURCEPACK,
      ProjectType.SHADER,
      ProjectType.WORLD,
    ]);
  });
});
