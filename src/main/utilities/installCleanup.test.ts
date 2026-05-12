import path from "path";
import { describe, expect, it } from "vitest";
import {
  getUnusedInstallResourcePaths,
  normalizeInstallResourcePath,
  shouldCleanupCancelledInstall,
} from "./installCleanup";

describe("install cleanup helpers", () => {
  it("keeps shared libraries and assets used by another version", () => {
    const minecraftPath = path.resolve("minecraft");
    const sharedLibrary = path.join(
      minecraftPath,
      "libraries",
      "org",
      "example",
      "shared.jar",
    );
    const uniqueLibrary = path.join(
      minecraftPath,
      "libraries",
      "org",
      "example",
      "unique.jar",
    );
    const sharedAsset = path.join(
      minecraftPath,
      "assets",
      "objects",
      "ab",
      "abcdef",
    );
    const uniqueAsset = path.join(
      minecraftPath,
      "assets",
      "objects",
      "cd",
      "cdefab",
    );

    const removable = getUnusedInstallResourcePaths(
      [sharedLibrary, uniqueLibrary, sharedAsset, uniqueAsset],
      [sharedLibrary, sharedAsset],
    );

    expect(removable).toEqual([uniqueLibrary, uniqueAsset]);
  });

  it("deduplicates cleanup candidates case-insensitively", () => {
    const filePath = path.resolve("minecraft", "libraries", "lib.jar");

    expect(
      getUnusedInstallResourcePaths([filePath, filePath.toUpperCase()], []),
    ).toEqual([filePath]);
  });

  it("accepts already-normalized shared resource paths", () => {
    const shared = path.resolve("minecraft", "assets", "indexes", "1.21.json");
    const unique = path.resolve("minecraft", "assets", "indexes", "1.20.json");

    expect(
      getUnusedInstallResourcePaths(
        [shared, unique],
        [normalizeInstallResourcePath(shared)],
      ),
    ).toEqual([unique]);
  });

  it("cleans cancelled installs only when explicitly requested", () => {
    expect(shouldCleanupCancelledInstall(true)).toBe(true);
    expect(shouldCleanupCancelledInstall(false)).toBe(false);
    expect(shouldCleanupCancelledInstall()).toBe(false);
  });
});
