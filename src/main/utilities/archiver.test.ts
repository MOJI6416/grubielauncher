import path from "path";
import { describe, expect, it } from "vitest";
import { getArchiveEntryName } from "./archiver";

describe("archiver helpers", () => {
  it("preserves relative folder structure inside archives", () => {
    const basePath = path.resolve("versions", "Pack");
    const filePath = path.join(basePath, "server", "mods", "example.jar");

    expect(getArchiveEntryName(filePath, basePath)).toBe(
      "server/mods/example.jar",
    );
  });

  it("falls back to basename for files outside the archive base path", () => {
    const basePath = path.resolve("versions", "Pack");
    const filePath = path.resolve("other", "secret.txt");

    expect(getArchiveEntryName(filePath, basePath)).toBe("secret.txt");
  });
});
