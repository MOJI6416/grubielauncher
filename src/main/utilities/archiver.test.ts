import path from "path";
import { describe, expect, it } from "vitest";
import {
  extractEntries,
  getArchiveEntryName,
  readEntryData,
} from "./archiver";

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

  it("rejects entries with a suspicious compression ratio before extraction", () => {
    const entry = {
      entryName: "bomb.txt",
      isDirectory: false,
      header: { size: 10_000, compressedSize: 1 },
    } as any;

    expect(() => readEntryData(entry)).toThrow(
      'Suspicious zip compression ratio: "bomb.txt"',
    );
  });

  it("rejects duplicate extraction targets", async () => {
    const makeEntry = (entryName: string) =>
      ({
        entryName,
        isDirectory: false,
        header: { size: 1, compressedSize: 1 },
      }) as any;

    await expect(
      extractEntries([makeEntry("a.txt"), makeEntry("b.txt")], () =>
        path.resolve("same.txt"),
      ),
    ).rejects.toThrow("Duplicate zip entry target");
  });
});
