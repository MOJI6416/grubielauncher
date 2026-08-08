import path from "path";
import { describe, expect, it } from "vitest";
import {
  getUnusedInstallResourcePaths,
  normalizeInstallResourcePath,
  shouldCleanupCancelledInstall,
  shouldCloseInstallProgress,
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

  it("deduplicates cleanup candidates only where the filesystem is case-insensitive", () => {
    const filePath = path.resolve("minecraft", "libraries", "lib.jar");
    const shouted = filePath.toUpperCase();
    const caseInsensitive =
      process.platform === "win32" || process.platform === "darwin";

    expect(getUnusedInstallResourcePaths([filePath, shouted], [])).toEqual(
      caseInsensitive ? [filePath] : [filePath, shouted],
    );
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

  it("closes the progress on failure even when a follow-up phase was expected", () => {
    expect(shouldCloseInstallProgress(false, true, false)).toBe(true);
    expect(shouldCloseInstallProgress(false, true, true)).toBe(true);
    expect(shouldCloseInstallProgress(false, false, false)).toBe(true);
  });

  it("keeps the progress open only for a successful phase that hands over", () => {
    expect(shouldCloseInstallProgress(true, true, false)).toBe(false);
    expect(shouldCloseInstallProgress(true, true, true)).toBe(true);
    expect(shouldCloseInstallProgress(true, false, false)).toBe(true);
    expect(shouldCloseInstallProgress(true)).toBe(true);
  });
});
