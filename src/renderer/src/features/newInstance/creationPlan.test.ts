import { describe, expect, it } from "vitest";
import {
  CreationInput,
  LARGE_DOWNLOAD_BYTES,
  canCreate,
  creationBlockers,
  creationWarnings,
} from "./creationPlan";

const ready: CreationInput = {
  hasAccount: true,
  isInternetOnline: true,
  isBackendOnline: true,
  loader: "fabric",
  nameOk: true,
  hasMinecraftVersion: true,
  hasLoaderVersion: true,
  loaderVersionUnresolved: false,
};

describe("creationBlockers", () => {
  it("returns nothing when everything is ready", () => {
    expect(creationBlockers(ready)).toEqual([]);
    expect(canCreate(ready)).toBe(true);
  });

  it("reports every missing piece at once", () => {
    expect(
      creationBlockers({
        ...ready,
        hasAccount: false,
        nameOk: false,
        hasMinecraftVersion: false,
        hasLoaderVersion: false,
      }),
    ).toEqual(["account", "name", "minecraftVersion", "loaderVersion"]);
  });

  it("does not ask vanilla for a loader version", () => {
    expect(
      creationBlockers({
        ...ready,
        loader: "vanilla",
        hasLoaderVersion: false,
      }),
    ).toEqual([]);
  });

  it("blocks forge and neoforge while the backend is down", () => {
    expect(
      creationBlockers({ ...ready, loader: "forge", isBackendOnline: false }),
    ).toEqual(["backend"]);
    expect(
      creationBlockers({ ...ready, loader: "fabric", isBackendOnline: false }),
    ).toEqual([]);
  });

  it("blocks everything without internet", () => {
    expect(creationBlockers({ ...ready, isInternetOnline: false })).toEqual([
      "internet",
    ]);
  });

  it("blocks a pack whose loader build could not be resolved", () => {
    expect(
      creationBlockers({ ...ready, loaderVersionUnresolved: true }),
    ).toEqual(["loaderVersionUnresolved"]);
  });
});

describe("creationWarnings", () => {
  const quiet = {
    versionKind: "release" as const,
    javaMajor: 21,
    hasLocalMods: false,
    bytes: 0,
    isBackendOnline: true,
    needsBackend: false,
  };

  it("stays quiet for a plain modern release", () => {
    expect(creationWarnings(quiet)).toEqual([]);
  });

  it("warns about snapshots and ancient versions", () => {
    expect(creationWarnings({ ...quiet, versionKind: "snapshot" })).toEqual([
      "snapshot",
    ]);
    expect(
      creationWarnings({ ...quiet, versionKind: "old", javaMajor: 8 }),
    ).toEqual(["oldVersion", "legacyJava"]);
  });

  it("warns when a shared pack carries hand-added files", () => {
    expect(creationWarnings({ ...quiet, hasLocalMods: true })).toEqual([
      "localMods",
    ]);
  });

  it("warns about a heavy download", () => {
    expect(creationWarnings({ ...quiet, bytes: LARGE_DOWNLOAD_BYTES })).toEqual(
      ["largeDownload"],
    );
    expect(
      creationWarnings({ ...quiet, bytes: LARGE_DOWNLOAD_BYTES - 1 }),
    ).toEqual([]);
  });

  it("warns only when the offline backend actually matters", () => {
    expect(
      creationWarnings({
        ...quiet,
        isBackendOnline: false,
        needsBackend: true,
      }),
    ).toEqual(["backend"]);
    expect(
      creationWarnings({
        ...quiet,
        isBackendOnline: false,
        needsBackend: false,
      }),
    ).toEqual([]);
  });
});
