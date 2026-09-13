import { describe, expect, it } from "vitest";
import type { LoaderRequirement } from "@/shared/loaderCompat";
import {
  LOADER_CHANGE_NOT_FOUND,
  LOADER_CHANGE_RUNNING,
  LOADER_CHANGE_UNVERIFIED,
} from "@/types/InstallationProgress";
import {
  buildLoaderVersionOptions,
  findLoaderUpdate,
  loaderChangeErrorKey,
  pickSuggestedLoaderVersion,
  resolveLoaderChangeBlock,
} from "./loaderUpdate";

const catalog = ["0.17.0-beta.1", "0.16.10", "0.16.9", "0.15.11"].map((id) => ({
  id,
}));

function requirement(ranges: string[]): LoaderRequirement {
  return { file: "mod.jar", modId: "mod", name: "Mod", syntax: "semver", ranges };
}

describe("buildLoaderVersionOptions", () => {
  it("marks the current, latest stable and rollback builds", () => {
    const options = buildLoaderVersionOptions({
      versions: catalog,
      currentId: "0.16.9",
      rollbackId: "0.15.11",
    });

    expect(options.map((option) => option.id)).toEqual([
      "0.17.0-beta.1",
      "0.16.10",
      "0.16.9",
      "0.15.11",
    ]);
    expect(options.find((option) => option.isCurrent)?.id).toBe("0.16.9");
    expect(options.find((option) => option.isLatest)?.id).toBe("0.16.10");
    expect(options.find((option) => option.isRollback)?.id).toBe("0.15.11");
    expect(options[0].stable).toBe(false);
  });

  it("tells an upgrade from a downgrade", () => {
    const options = buildLoaderVersionOptions({
      versions: catalog,
      currentId: "0.16.9",
    });

    expect(options.map((option) => option.direction)).toEqual([
      "upgrade",
      "upgrade",
      "current",
      "downgrade",
    ]);
  });

  it("keeps the installed build listed when the catalog no longer has it", () => {
    const options = buildLoaderVersionOptions({
      versions: catalog,
      currentId: "0.14.21",
    });

    expect(options.at(-1)).toMatchObject({ id: "0.14.21", isCurrent: true });
  });

  it("lists the mods each build would break", () => {
    const needsNew = requirement([">=0.16.10"]);
    const options = buildLoaderVersionOptions({
      versions: catalog,
      currentId: "0.16.9",
      requirements: [needsNew, requirement(["*"])],
    });

    expect(options.find((option) => option.id === "0.16.10")?.blocked).toEqual(
      [],
    );
    expect(options.find((option) => option.id === "0.16.9")?.blocked).toEqual([
      needsNew,
    ]);
  });
});

describe("findLoaderUpdate", () => {
  it("returns the newest stable build above the installed one", () => {
    expect(findLoaderUpdate(catalog, "0.15.11")).toBe("0.16.10");
  });

  it("stays quiet when the instance is already on the newest stable build", () => {
    expect(findLoaderUpdate(catalog, "0.16.10")).toBeUndefined();
    expect(findLoaderUpdate(catalog, undefined)).toBeUndefined();
  });
});

describe("pickSuggestedLoaderVersion", () => {
  it("suggests the newest stable upgrade no mod objects to", () => {
    const options = buildLoaderVersionOptions({
      versions: catalog,
      currentId: "0.15.11",
      requirements: [requirement(["<0.16.10"])],
    });

    expect(pickSuggestedLoaderVersion(options)).toBe("0.16.9");
  });

  it("falls back to the installed build when nothing newer fits", () => {
    const options = buildLoaderVersionOptions({
      versions: catalog,
      currentId: "0.16.10",
    });

    expect(pickSuggestedLoaderVersion(options)).toBe("0.16.10");
  });
});

describe("resolveLoaderChangeBlock", () => {
  const ready = {
    isReadOnly: false,
    hasAccount: true,
    isRunning: false,
    isInstallActive: false,
    isBusy: false,
    isOnline: true,
    needsNetwork: true,
  };

  it("allows a change when nothing stands in the way", () => {
    expect(resolveLoaderChangeBlock(ready)).toBeNull();
  });

  it("explains the first reason a change cannot start", () => {
    expect(resolveLoaderChangeBlock({ ...ready, isReadOnly: true })).toBe(
      "readOnly",
    );
    expect(resolveLoaderChangeBlock({ ...ready, hasAccount: false })).toBe(
      "noAccount",
    );
    expect(resolveLoaderChangeBlock({ ...ready, isRunning: true })).toBe(
      "running",
    );
    expect(resolveLoaderChangeBlock({ ...ready, isInstallActive: true })).toBe(
      "installing",
    );
    expect(resolveLoaderChangeBlock({ ...ready, isOnline: false })).toBe(
      "offline",
    );
  });

  it("lets a rollback run offline", () => {
    expect(
      resolveLoaderChangeBlock({ ...ready, isOnline: false, needsNetwork: false }),
    ).toBeNull();
  });
});

describe("loaderChangeErrorKey", () => {
  it("maps the main-process codes to messages", () => {
    expect(loaderChangeErrorKey(new Error(LOADER_CHANGE_RUNNING))).toBe(
      "loaderUpdate.errors.running",
    );
    expect(loaderChangeErrorKey(new Error(LOADER_CHANGE_UNVERIFIED))).toBe(
      "loaderUpdate.errors.unverified",
    );
    expect(loaderChangeErrorKey(LOADER_CHANGE_NOT_FOUND)).toBe(
      "loaderUpdate.errors.notFound",
    );
  });

  it("leaves other failures to the general classifier", () => {
    expect(loaderChangeErrorKey(new Error("Failed to download"))).toBeNull();
    expect(loaderChangeErrorKey(new Error("constructor"))).toBeNull();
    expect(loaderChangeErrorKey(undefined)).toBeNull();
  });
});
