import fs from "fs-extra";
import os from "os";
import path from "path";
import zip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createZipArchive,
  extractEntries,
  getArchiveEntryName,
  readEntryData,
} from "./archiver";
import { isExcludedInstancePath } from "@/shared/instancePrivacy";

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
      header: { size: 64 * 1024 * 1024, compressedSize: 1024 },
    } as any;

    expect(() => readEntryData(entry)).toThrow(
      'Suspicious zip compression ratio: "bomb.txt"',
    );
  });

  it("accepts a header-only region file, which Minecraft writes as zeroes", async () => {
    const data = Buffer.alloc(8192);
    const entry = {
      entryName: "world/entities/r.0.0.mca",
      isDirectory: false,
      header: { size: 8192, compressedSize: 25 },
      getDataAsync: (callback: (value: Buffer) => void) => callback(data),
    } as any;

    await expect(readEntryData(entry)).resolves.toHaveLength(8192);
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

describe("createZipArchive with an entry filter", () => {
  let root = "";
  let versionPath = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-archive-"));
    versionPath = path.join(root, "instance");

    await fs.outputFile(path.join(versionPath, "sessions.json"), "[]");
    await fs.outputFile(path.join(versionPath, "notes.txt"), "private note");
    await fs.outputFile(path.join(versionPath, "usercache.json"), "[]");
    await fs.outputFile(path.join(versionPath, "config", "mod.toml"), "a=1");
    await fs.outputFile(
      path.join(versionPath, "config", "sessions.json"),
      "a mod config, not the launcher file",
    );
    await fs.outputFile(path.join(versionPath, "logs", "latest.log"), "log");
    await fs.outputFile(
      path.join(versionPath, "storage", "trash", "removed.jar"),
      "jar",
    );
    await fs.outputFile(
      path.join(versionPath, "storage", "server-overrides", "server.toml"),
      "b=2",
    );
    await fs.outputFile(path.join(versionPath, "servers.dat"), "nbt");
    await fs.outputFile(path.join(versionPath, "command_history.txt"), "/login");
    await fs.outputFile(path.join(versionPath, "server", "server.properties"), "c=3");
    await fs.outputFile(path.join(versionPath, "server", "usercache.json"), "[]");
    await fs.outputFile(path.join(versionPath, "server", "logs", "latest.log"), "log");
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  const archiveNames = async (files: string[]) => {
    const zipPath = path.join(root, "pack.zip");
    await createZipArchive(
      files,
      zipPath,
      versionPath,
      9,
      isExcludedInstancePath,
    );

    return new zip(await fs.readFile(zipPath))
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName);
  };

  it("keeps private instance files out of the archive", async () => {
    const names = await archiveNames([
      path.join(versionPath, "sessions.json"),
      path.join(versionPath, "notes.txt"),
      path.join(versionPath, "usercache.json"),
      path.join(versionPath, "config"),
    ]);

    expect(names).toContain("config/mod.toml");
    expect(names).not.toContain("sessions.json");
    expect(names).not.toContain("notes.txt");
    expect(names).not.toContain("usercache.json");
  });

  it("filters private paths nested inside a shared folder", async () => {
    const names = await archiveNames([
      path.join(versionPath, "logs"),
      path.join(versionPath, "storage"),
    ]);

    expect(names).toContain("storage/server-overrides/server.toml");
    expect(names.some((name) => name.startsWith("logs/"))).toBe(false);
    expect(names.some((name) => name.startsWith("storage/trash/"))).toBe(false);
  });

  it("matches private names only at the instance root", async () => {
    const names = await archiveNames([path.join(versionPath, "config")]);

    expect(names).toContain("config/sessions.json");
  });

  it("keeps the server list and the chat command history out", async () => {
    const names = await archiveNames([
      path.join(versionPath, "servers.dat"),
      path.join(versionPath, "command_history.txt"),
      path.join(versionPath, "config"),
    ]);

    expect(names).toContain("config/mod.toml");
    expect(names).not.toContain("servers.dat");
    expect(names).not.toContain("command_history.txt");
  });

  it("filters private paths inside an installed server", async () => {
    const names = await archiveNames([path.join(versionPath, "server")]);

    expect(names).toContain("server/server.properties");
    expect(names).not.toContain("server/usercache.json");
    expect(names.some((name) => name.startsWith("server/logs/"))).toBe(false);
  });
});
