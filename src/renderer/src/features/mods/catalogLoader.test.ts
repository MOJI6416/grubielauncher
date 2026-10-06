import { describe, expect, it } from "vitest";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import {
  catalogLoaderHintKey,
  catalogLoaderOptions,
  hasConnector,
  needsConnector,
  sharedTagLoader,
  skipsDependencies,
} from "./catalogLoader";

function mod(id: string, title: string): ILocalProject {
  return {
    id,
    title,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    version: null,
  };
}

describe("catalogLoaderOptions", () => {
  it("offers Fabric next to loaders that can run Fabric mods", () => {
    expect(catalogLoaderOptions("neoforge", ProjectType.MOD)).toEqual([
      "neoforge",
      "fabric",
    ]);
    expect(catalogLoaderOptions("forge", ProjectType.MOD)).toEqual([
      "forge",
      "fabric",
    ]);
    expect(catalogLoaderOptions("quilt", ProjectType.MOD)).toEqual([
      "quilt",
      "fabric",
    ]);
    expect(catalogLoaderOptions("legacy-fabric", ProjectType.MOD)).toEqual([
      "legacy-fabric",
      "fabric",
    ]);
  });

  it("offers nothing for Fabric, vanilla and non-mod content", () => {
    expect(catalogLoaderOptions("fabric", ProjectType.MOD)).toEqual([]);
    expect(catalogLoaderOptions("babric", ProjectType.MOD)).toEqual([]);
    expect(catalogLoaderOptions("ornithe", ProjectType.MOD)).toEqual([]);
    expect(catalogLoaderOptions("vanilla", ProjectType.MOD)).toEqual([]);
    expect(catalogLoaderOptions("neoforge", ProjectType.SHADER)).toEqual([]);
    expect(catalogLoaderOptions(undefined, ProjectType.MOD)).toEqual([]);
  });
});

describe("needsConnector", () => {
  it("is only about Fabric mods in Forge-family instances", () => {
    expect(needsConnector("neoforge", "fabric")).toBe(true);
    expect(needsConnector("forge", "fabric")).toBe(true);
    expect(needsConnector("quilt", "fabric")).toBe(false);
    expect(needsConnector("neoforge", "neoforge")).toBe(false);
  });
});

describe("hasConnector", () => {
  it("recognises Connector from either catalog or a local jar", () => {
    expect(hasConnector([mod("u58R1TMW", "Sinytra Connector")])).toBe(true);
    expect(hasConnector([mod("connector", "Connector")])).toBe(true);
    expect(hasConnector([mod("x", "Sinytra Connector (NeoForge)")])).toBe(true);
    expect(hasConnector([mod("sodium", "Sodium")])).toBe(false);
  });
});

describe("catalogLoaderHintKey", () => {
  it("explains Connector only where Connector is what runs Fabric mods", () => {
    expect(catalogLoaderHintKey("forge")).toBe("modManager.catalogLoaderHint");
    expect(catalogLoaderHintKey("neoforge")).toBe(
      "modManager.catalogLoaderHint",
    );
    expect(catalogLoaderHintKey("quilt")).toBe(
      "modManager.catalogLoaderHintQuilt",
    );
    expect(catalogLoaderHintKey("legacy-fabric")).toBe(
      "modManager.catalogLoaderHintLegacyFabric",
    );
  });
});

describe("Legacy Fabric and the plain Fabric tag", () => {
  it("looks a mod up under the other tag when the first one is empty", () => {
    expect(
      sharedTagLoader("legacy-fabric", "legacy-fabric", ProjectType.MOD),
    ).toBe("fabric");
    expect(sharedTagLoader("legacy-fabric", "fabric", ProjectType.MOD)).toBe(
      "legacy-fabric",
    );
    expect(
      sharedTagLoader("legacy-fabric", "fabric", ProjectType.RESOURCEPACK),
    ).toBeUndefined();
    expect(
      sharedTagLoader("fabric", "fabric", ProjectType.MOD),
    ).toBeUndefined();
  });

  it("keeps dependencies for Legacy Fabric, skips them where Connector is involved", () => {
    expect(skipsDependencies("legacy-fabric", "fabric")).toBe(false);
    expect(skipsDependencies("forge", "fabric")).toBe(true);
    expect(skipsDependencies("quilt", "fabric")).toBe(true);
    expect(skipsDependencies("fabric", undefined)).toBe(false);
    expect(skipsDependencies("fabric", "fabric")).toBe(false);
  });
});
