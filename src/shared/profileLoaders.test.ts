import { describe, expect, it } from "vitest";
import {
  fabricFamilyFor,
  isLegacyLoader,
  isProfileLoader,
  ornitheIntermediaryGeneration,
  ornitheLoaderVersionId,
  profileJsonUrl,
  splitOrnitheGeneration,
} from "./profileLoaders";

describe("fabricFamilyFor", () => {
  it("keeps Fabric where Fabric itself runs", () => {
    expect(fabricFamilyFor("1.14")).toBe("fabric");
    expect(fabricFamilyFor("1.21.1")).toBe("fabric");
    expect(fabricFamilyFor("26.1")).toBe("fabric");
    expect(fabricFamilyFor("18w43b")).toBe("fabric");
  });

  it("sends older Fabric packs to the loader that runs them", () => {
    expect(fabricFamilyFor("1.13.2")).toBe("legacy-fabric");
    expect(fabricFamilyFor("1.8.9")).toBe("legacy-fabric");
    expect(fabricFamilyFor("1.3.2")).toBe("legacy-fabric");
    expect(fabricFamilyFor("b1.7.3")).toBe("babric");
    expect(fabricFamilyFor("1.2.5")).toBe("ornithe");
    expect(fabricFamilyFor("b1.8.1")).toBe("ornithe");
    expect(fabricFamilyFor("a1.2.6")).toBe("ornithe");
    expect(fabricFamilyFor("13w16a")).toBe("ornithe");
  });
});

describe("loader groups", () => {
  it("tells profile loaders and the old-version ones apart", () => {
    expect(isProfileLoader("fabric")).toBe(true);
    expect(isProfileLoader("bta-babric")).toBe(false);
    expect(isLegacyLoader("ornithe")).toBe(true);
    expect(isLegacyLoader("fabric")).toBe(false);
  });
});

describe("Ornithe generations", () => {
  it("keeps gen2 ids bare and tags gen1 ids", () => {
    expect(ornitheLoaderVersionId("0.19.5", 2)).toBe("0.19.5");
    expect(ornitheLoaderVersionId("0.19.5", 1)).toBe("0.19.5+gen1");
    expect(splitOrnitheGeneration("0.19.5")).toEqual({ version: "0.19.5", generation: 2 });
    expect(splitOrnitheGeneration("0.19.5+gen1")).toEqual({
      version: "0.19.5",
      generation: 1,
    });
  });

  it("points each generation to its own profile", () => {
    expect(profileJsonUrl("ornithe", "1.12.2", "0.19.5")).toBe(
      "https://meta.ornithemc.net/v3/versions/gen2/fabric-loader/1.12.2/0.19.5/profile/json",
    );
    expect(profileJsonUrl("ornithe", "1.12.2", "0.19.5+gen1")).toBe(
      "https://meta.ornithemc.net/v3/versions/gen1/fabric-loader/1.12.2/0.19.5/profile/json",
    );
    expect(profileJsonUrl("legacy-fabric", "1.8.9", "0.16.0")).toBe(
      "https://meta.legacyfabric.net/v2/versions/loader/1.8.9/0.16.0/profile/json",
    );
  });

  it("reads the generation from the intermediary library", () => {
    expect(
      ornitheIntermediaryGeneration([
        "net.fabricmc:fabric-loader:0.19.5",
        "net.ornithemc:calamus-intermediary:1.12.2",
      ]),
    ).toBe(1);
    expect(
      ornitheIntermediaryGeneration(["net.ornithemc:calamus-intermediary-gen2:b1.7.3"]),
    ).toBe(2);
    expect(ornitheIntermediaryGeneration(["net.fabricmc:intermediary:1.21.1"])).toBeUndefined();
  });
});
