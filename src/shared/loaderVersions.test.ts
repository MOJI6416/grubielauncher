import { describe, expect, it } from "vitest";
import {
  createLoaderVersionFromManifest,
  loaderVersionMatches,
  parseCurseForgeLoaderId,
  resolveImportedLoaderVersion,
} from "./loaderVersions";

describe("loader version helpers", () => {
  it("parses CurseForge loader id without losing fabric/quilt loader names", () => {
    expect(parseCurseForgeLoaderId("forge-47.2.20")).toEqual({
      loader: "forge",
      loaderVersion: "47.2.20",
    });
    expect(parseCurseForgeLoaderId("fabric-loader-0.16.10")).toEqual({
      loader: "fabric",
      loaderVersion: "0.16.10",
    });
    expect(parseCurseForgeLoaderId("quilt-loader-0.27.1")).toEqual({
      loader: "quilt",
      loaderVersion: "0.27.1",
    });
  });

  it("matches exact imported loader version instead of picking the latest one", () => {
    const result = resolveImportedLoaderVersion({
      loader: "forge",
      minecraftVersion: "1.20.1",
      requiredLoaderVersion: "47.2.20",
      availableVersions: [
        { id: "47.4.0", url: "latest.jar" },
        { id: "47.2.20", url: "required.jar" },
      ],
    });

    expect(result.status).toBe("matched");
    expect(result.version?.id).toBe("47.2.20");
    expect(result.version?.url).toBe("required.jar");
  });

  it("matches loader ids that include loader or Minecraft prefixes", () => {
    expect(
      loaderVersionMatches(
        "47.2.20",
        "forge-47.2.20",
        "forge",
        "1.20.1",
      ),
    ).toBe(true);
    expect(
      loaderVersionMatches(
        "47.2.20",
        "1.20.1-47.2.20",
        "forge",
        "1.20.1",
      ),
    ).toBe(true);
  });

  it("can synthesize an exact Forge loader installer URL when backend metadata is missing", () => {
    const version = createLoaderVersionFromManifest(
      "forge",
      "1.20.1",
      "forge-47.2.20",
    );

    expect(version).toEqual({
      id: "47.2.20",
      url: "https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.20/forge-1.20.1-47.2.20-installer.jar",
    });
  });

  it("does not synthesize unsafe loader ids", () => {
    expect(
      createLoaderVersionFromManifest("forge", "1.20.1", "../47.2.20"),
    ).toBeNull();
  });

  it("reports missing required loader version for modpacks instead of falling back", () => {
    const result = resolveImportedLoaderVersion({
      loader: "forge",
      minecraftVersion: "1.20.1",
      requiredLoaderVersion: undefined,
      availableVersions: [{ id: "47.4.0", url: "latest.jar" }],
    });

    expect(result.status).toBe("missingRequired");
  });
});
