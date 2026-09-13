import { describe, expect, it } from "vitest";
import {
  compareLoaderVersions,
  findBlockingRequirements,
  isModdedLoader,
  isRequirementSatisfied,
  isStableLoaderVersion,
  LoaderRequirement,
  manifestMentionsLoaderVersion,
  satisfiesMavenRange,
  satisfiesSemverPredicate,
} from "./loaderCompat";

function requirement(
  syntax: LoaderRequirement["syntax"],
  ranges: string[],
): LoaderRequirement {
  return { file: "mod.jar", modId: "mod", name: "Mod", syntax, ranges };
}

describe("compareLoaderVersions", () => {
  it("orders numeric components numerically", () => {
    expect(compareLoaderVersions("0.16.10", "0.16.9")).toBe(1);
    expect(compareLoaderVersions("47.4.3", "47.4.23")).toBe(-1);
    expect(compareLoaderVersions("14.23.5.2860", "14.23.5.2855")).toBe(1);
  });

  it("treats missing trailing components as zero", () => {
    expect(compareLoaderVersions("47.1", "47.1.0")).toBe(0);
  });

  it("puts a pre-release below its release", () => {
    expect(compareLoaderVersions("0.16.0-beta.1", "0.16.0")).toBe(-1);
    expect(compareLoaderVersions("21.0.0-beta", "21.0.1-beta")).toBe(-1);
    expect(compareLoaderVersions("0.26.0-beta.2", "0.26.0-beta.10")).toBe(-1);
  });

  it("ignores build metadata", () => {
    expect(compareLoaderVersions("0.7.2+build.174", "0.7.2")).toBe(0);
  });
});

describe("isStableLoaderVersion", () => {
  it("marks pre-release channels as unstable", () => {
    expect(isStableLoaderVersion("0.26.0-beta.1")).toBe(false);
    expect(isStableLoaderVersion("21.0.0-beta")).toBe(false);
    expect(isStableLoaderVersion("1.0.0-rc.2")).toBe(false);
  });

  it("keeps releases, build metadata and legacy Forge suffixes stable", () => {
    expect(isStableLoaderVersion("0.16.10")).toBe(true);
    expect(isStableLoaderVersion("47.4.23")).toBe(true);
    expect(isStableLoaderVersion("0.7.2+build.174")).toBe(true);
    expect(isStableLoaderVersion("10.13.4.1614-1.7.10")).toBe(true);
  });
});

describe("isModdedLoader", () => {
  it("accepts only the four mod loaders", () => {
    expect(isModdedLoader("fabric")).toBe(true);
    expect(isModdedLoader("neoforge")).toBe(true);
    expect(isModdedLoader("vanilla")).toBe(false);
    expect(isModdedLoader("constructor")).toBe(false);
  });
});

describe("satisfiesSemverPredicate", () => {
  it("handles comparison operators", () => {
    expect(satisfiesSemverPredicate("0.16.10", ">=0.15.0")).toBe(true);
    expect(satisfiesSemverPredicate("0.14.21", ">=0.15.0")).toBe(false);
    expect(satisfiesSemverPredicate("0.16.10", "<0.17")).toBe(true);
    expect(satisfiesSemverPredicate("0.17.0", "<0.17")).toBe(false);
  });

  it("combines space-separated terms as all-of", () => {
    expect(satisfiesSemverPredicate("0.16.10", ">=0.15.0 <0.17")).toBe(true);
    expect(satisfiesSemverPredicate("0.17.2", ">=0.15.0 <0.17")).toBe(false);
  });

  it("follows Fabric's ~ and ^ rules", () => {
    expect(satisfiesSemverPredicate("0.15.11", "~0.15.3")).toBe(true);
    expect(satisfiesSemverPredicate("0.16.0", "~0.15.3")).toBe(false);
    expect(satisfiesSemverPredicate("0.16.10", "^0.15.0")).toBe(true);
    expect(satisfiesSemverPredicate("1.0.0", "^0.15.0")).toBe(false);
  });

  it("expands .x wildcards", () => {
    expect(satisfiesSemverPredicate("0.15.11", "0.15.x")).toBe(true);
    expect(satisfiesSemverPredicate("0.16.0", "0.15.x")).toBe(false);
    expect(satisfiesSemverPredicate("0.99.0", "0.x")).toBe(true);
  });

  it("matches a bare version exactly", () => {
    expect(satisfiesSemverPredicate("0.15.11", "0.15.11")).toBe(true);
    expect(satisfiesSemverPredicate("0.15.10", "=0.15.11")).toBe(false);
  });

  it("accepts anything for * and an empty predicate", () => {
    expect(satisfiesSemverPredicate("0.16.10", "*")).toBe(true);
    expect(satisfiesSemverPredicate("0.16.10", "")).toBe(true);
  });

  it("reports an unreadable predicate as unknown", () => {
    expect(satisfiesSemverPredicate("0.16.10", "latest")).toBeNull();
    expect(satisfiesSemverPredicate("0.16.10", ">=0.x")).toBeNull();
  });
});

describe("satisfiesMavenRange", () => {
  it("handles half-open ranges", () => {
    expect(satisfiesMavenRange("47.4.23", "[47,)")).toBe(true);
    expect(satisfiesMavenRange("46.0.14", "[47,)")).toBe(false);
    expect(satisfiesMavenRange("48.0.0", "[47.1.0,48)")).toBe(false);
    expect(satisfiesMavenRange("47.2.0", "(,47.2]")).toBe(true);
    expect(satisfiesMavenRange("47.2.1", "(,47.2]")).toBe(false);
  });

  it("handles an exact pin and a union of ranges", () => {
    expect(satisfiesMavenRange("47.1.3", "[47.1.3]")).toBe(true);
    expect(satisfiesMavenRange("47.1.4", "[47.1.3]")).toBe(false);
    expect(satisfiesMavenRange("3.5", "[1.0,2.0),[3.0,)")).toBe(true);
    expect(satisfiesMavenRange("2.5", "[1.0,2.0),[3.0,)")).toBe(false);
  });

  it("treats a bare version as a soft recommendation", () => {
    expect(satisfiesMavenRange("40.0.0", "47.1.3")).toBe(true);
    expect(satisfiesMavenRange("40.0.0", "*")).toBe(true);
  });

  it("strips a Minecraft prefix from the bounds", () => {
    expect(satisfiesMavenRange("47.4.23", "[1.20.1-47.1.0,)", "1.20.1")).toBe(
      true,
    );
  });

  it("keeps NeoForge betas below the release they precede", () => {
    expect(satisfiesMavenRange("21.1.77", "[21.1.0,)")).toBe(true);
    expect(satisfiesMavenRange("21.0.0-beta", "[21.0.0,)")).toBe(false);
  });

  it("reports an unreadable range as unknown", () => {
    expect(satisfiesMavenRange("47.4.23", "[abc,)")).toBeNull();
  });

  it("reads the range shapes real Forge mods ship", () => {
    expect(satisfiesMavenRange("47.4.22", "[46, 48)")).toBe(true);
    expect(satisfiesMavenRange("48.0.1", "[46, 48)")).toBe(false);
    expect(satisfiesMavenRange("47.4.22", "[46, )")).toBe(true);
    expect(satisfiesMavenRange("47.1.20", "[46,47.1.3],[47.1.43,)")).toBe(
      false,
    );
    expect(satisfiesMavenRange("47.4.22", "[46,47.1.3],[47.1.43,)")).toBe(
      true,
    );
    expect(satisfiesMavenRange("47.4.22", "[47.4.23,)")).toBe(false);
    expect(satisfiesMavenRange("47.4.22", "[0,)")).toBe(true);
  });
});

describe("isRequirementSatisfied", () => {
  it("accepts when any listed range matches", () => {
    expect(
      isRequirementSatisfied(
        "0.16.10",
        requirement("semver", [">=0.17", ">=0.16.5"]),
      ),
    ).toBe(true);
  });

  it("does not block on a requirement it cannot read", () => {
    expect(
      isRequirementSatisfied("0.16.10", requirement("semver", ["latest"])),
    ).toBe(true);
  });

  it("lists only the requirements a version breaks", () => {
    const needsNew = requirement("maven", ["[47.3,)"]);
    const anyForge = requirement("maven", ["[47,)"]);

    expect(
      findBlockingRequirements("47.2.0", [needsNew, anyForge], "1.20.1"),
    ).toEqual([needsNew]);
  });
});

describe("manifestMentionsLoaderVersion", () => {
  it("finds Fabric and Quilt loaders by library version", () => {
    const manifest = {
      libraries: [{ name: "net.fabricmc:fabric-loader:0.16.10" }],
    };

    expect(manifestMentionsLoaderVersion(manifest, "0.16.10")).toBe(true);
    expect(manifestMentionsLoaderVersion(manifest, "0.16.1")).toBe(false);
  });

  it("finds modern Forge and NeoForge by their launch arguments", () => {
    expect(
      manifestMentionsLoaderVersion(
        { arguments: { game: ["--fml.forgeVersion", "47.4.23"] }, libraries: [] },
        "47.4.23",
      ),
    ).toBe(true);
    expect(
      manifestMentionsLoaderVersion(
        {
          arguments: { game: ["--fml.neoForgeVersion", "21.1.77"] },
          libraries: [],
        },
        "21.1.77",
      ),
    ).toBe(true);
  });

  it("finds legacy Forge by its prefixed library version", () => {
    expect(
      manifestMentionsLoaderVersion(
        {
          libraries: [
            { name: "net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10" },
          ],
        },
        "10.13.4.1614",
      ),
    ).toBe(true);
    expect(
      manifestMentionsLoaderVersion(
        { libraries: [{ name: "net.minecraftforge:fmlloader:1.20.1-47.4.23" }] },
        "47.4.2",
      ),
    ).toBe(false);
  });

  it("rejects a missing manifest", () => {
    expect(manifestMentionsLoaderVersion(null, "0.16.10")).toBe(false);
  });
});
