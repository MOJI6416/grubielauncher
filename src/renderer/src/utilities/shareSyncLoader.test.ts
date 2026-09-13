import { describe, expect, it } from "vitest";
import type { IVersionConf } from "@/types/IVersion";
import { getShareDiffParts, pickSyncLoaderVersion } from "./shareSyncPure";

const unchanged = {
  remoteName: "Pack",
  currentName: "Pack",
  remoteImage: "logo",
  currentLogo: "logo",
  modsEqual: true,
  serversEqual: true,
  remoteQuickServer: "",
  currentQuickServer: "",
  remoteRunArguments: { game: "", jvm: "" },
  currentRunArguments: { game: "", jvm: "" },
  remoteOptions: "options",
  currentOptions: "options",
  remoteOther: { paths: [], size: 0, url: "" },
  currentOther: { paths: [], size: 0, url: "" },
};

function side(
  loader: string,
  loaderId: string | undefined,
  game: string | IVersionConf["version"] = "1.21.1",
) {
  return {
    version: typeof game === "string" ? { id: game, type: "release", url: "", serverManager: true } : game,
    loader: {
      name: loader,
      mods: [],
      version: loaderId ? { id: loaderId, url: "https://meta.fabricmc.net/x" } : undefined,
    },
  } as unknown as Pick<IVersionConf, "loader" | "version">;
}

describe("getShareDiffParts loader build", () => {
  it("offers the author to publish a changed loader build", () => {
    expect(
      getShareDiffParts({
        ...unchanged,
        isOwner: true,
        remoteLoaderVersion: "0.15.11",
        currentLoaderVersion: "0.16.10",
      }),
    ).toEqual(["loader"]);
  });

  it("stays quiet for players and for an unchanged build", () => {
    expect(
      getShareDiffParts({
        ...unchanged,
        isOwner: false,
        remoteLoaderVersion: "0.15.11",
        currentLoaderVersion: "0.16.10",
      }),
    ).toEqual([]);
    expect(
      getShareDiffParts({
        ...unchanged,
        isOwner: true,
        remoteLoaderVersion: "0.16.10",
        currentLoaderVersion: "0.16.10",
      }),
    ).toEqual([]);
  });
});

describe("pickSyncLoaderVersion", () => {
  it("returns the author's build when only the build differs", () => {
    expect(
      pickSyncLoaderVersion(side("fabric", "0.15.11"), side("fabric", "0.16.10")),
    ).toBe("0.16.10");
  });

  it("does nothing when the builds already match", () => {
    expect(
      pickSyncLoaderVersion(side("fabric", "0.16.10"), side("fabric", "0.16.10")),
    ).toBeNull();
  });

  it("leaves a different loader or game version to a full reinstall", () => {
    expect(
      pickSyncLoaderVersion(side("fabric", "0.15.11"), side("quilt", "0.26.4")),
    ).toBeNull();
    expect(
      pickSyncLoaderVersion(
        side("fabric", "0.15.11"),
        side("fabric", "0.16.10", "1.21.4"),
      ),
    ).toBeNull();
  });

  it("accepts a legacy string game version on the published side", () => {
    expect(
      pickSyncLoaderVersion(
        side("forge", "47.2.0", "1.20.1"),
        side("forge", "47.4.23", "1.20.1" as never),
      ),
    ).toBe("47.4.23");
  });

  it("ignores vanilla instances and unsafe build ids", () => {
    expect(
      pickSyncLoaderVersion(side("vanilla", undefined), side("vanilla", "x")),
    ).toBeNull();
    expect(
      pickSyncLoaderVersion(side("fabric", "0.15.11"), side("fabric", "../evil")),
    ).toBeNull();
  });
});
