import { describe, expect, it } from "vitest";
import {
  btaManifestUrl,
  hasBtaLauncherManifest,
  listBtaVersions,
} from "./btaLoader";

describe("hasBtaLauncherManifest", () => {
  it("accepts 7.3 and newer, the releases that ship manifest.json", () => {
    expect(hasBtaLauncherManifest("v7.3")).toBe(true);
    expect(hasBtaLauncherManifest("v7.3_04")).toBe(true);
    expect(hasBtaLauncherManifest("v8.0.1")).toBe(true);
    expect(hasBtaLauncherManifest("v10.1")).toBe(true);
  });

  it("rejects the jar-mod era and anything unparsable", () => {
    expect(hasBtaLauncherManifest("v7.2_01")).toBe(false);
    expect(hasBtaLauncherManifest("v1.7.7.0_02")).toBe(false);
    expect(hasBtaLauncherManifest("latest")).toBe(false);
  });
});

describe("listBtaVersions", () => {
  it("keeps supported releases, newest first", () => {
    expect(
      listBtaVersions({
        versions: {
          "v7.3": { release: "2025-01-26 18:00" },
          "v8.0.1": { release: "2026-07-25 16:00" },
          "v7.2_01": { release: "2024-08-04 16:00" },
          "v8.0": { release: "2026-07-20 15:17" },
        },
      }),
    ).toEqual(["v8.0.1", "v8.0", "v7.3"]);
    expect(listBtaVersions({})).toEqual([]);
  });

  it("builds the manifest address of a release", () => {
    expect(btaManifestUrl("v8.0.1")).toBe(
      "https://downloads.betterthanadventure.net/bta-client/release/v8.0.1/manifest.json",
    );
  });
});
