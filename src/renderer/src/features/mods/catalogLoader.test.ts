import { describe, expect, it } from "vitest";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import {
  catalogLoaderOptions,
  hasConnector,
  needsConnector,
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
  });

  it("offers nothing for Fabric, vanilla and non-mod content", () => {
    expect(catalogLoaderOptions("fabric", ProjectType.MOD)).toEqual([]);
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
