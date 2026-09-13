import fs from "fs-extra";
import os from "os";
import path from "path";
import zip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createZipArchive,
  extractZip,
  extractZipEntries,
  getArchiveEntryName,
  listZipEntries,
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
});

describe("streamed zip reading", () => {
  const LIMITS = {
    maxArchiveBytes: 64 * 1024 * 1024,
    maxTotalUncompressedBytes: 64 * 1024 * 1024,
  };

  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-zip-stream-"));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  const writeZip = (entries: Record<string, string>) => {
    const archive = new zip();
    for (const [name, content] of Object.entries(entries)) {
      archive.addFile(name, Buffer.from(content));
    }

    const zipPath = path.join(root, "archive.zip");
    archive.writeZip(zipPath);
    return zipPath;
  };

  it("lists entries with forward-slash names and directory flags", async () => {
    const zipPath = writeZip({ "World/": "", "World/level.dat": "nbt" });

    const entries = await listZipEntries(zipPath, LIMITS);

    expect(entries.map((entry) => [entry.name, entry.isDirectory])).toEqual([
      ["World/", true],
      ["World/level.dat", false],
    ]);
  });

  it("writes only the entries the caller maps to a target", async () => {
    const zipPath = writeZip({
      "World/level.dat": "nbt",
      "World/region/r.0.0.mca": "region",
      "readme.txt": "hi",
    });
    const destination = path.join(root, "saves", "World");

    const written = await extractZipEntries(
      zipPath,
      (name) =>
        name.startsWith("World/")
          ? path.join(destination, name.slice("World/".length))
          : null,
      LIMITS,
    );

    expect(written).toBe(2);
    expect(
      await fs.readFile(path.join(destination, "region", "r.0.0.mca"), "utf-8"),
    ).toBe("region");
    expect(await fs.pathExists(path.join(root, "saves", "readme.txt"))).toBe(
      false,
    );
  });

  it("refuses an archive over the size limit before reading it", async () => {
    const zipPath = writeZip({ "a.txt": "a".repeat(4096) });

    await expect(
      listZipEntries(zipPath, { ...LIMITS, maxArchiveBytes: 16 }),
    ).rejects.toThrow("Zip archive exceeds compressed size limit");
  });

  it("refuses duplicate targets before writing anything", async () => {
    const zipPath = writeZip({ "a.txt": "a", "b.txt": "b" });
    const target = path.join(root, "same.txt");

    await expect(
      extractZipEntries(zipPath, () => target, LIMITS),
    ).rejects.toThrow("Duplicate zip entry target");
    expect(await fs.pathExists(target)).toBe(false);
  });

  it("stops before writing when any target is unsafe", async () => {
    const zipPath = writeZip({ "ok.txt": "fine", "bad.txt": "nope" });
    const destination = path.join(root, "out");

    await expect(
      extractZipEntries(
        zipPath,
        (name) => {
          if (name === "bad.txt") throw new Error("unsafe entry");
          return path.join(destination, name);
        },
        LIMITS,
      ),
    ).rejects.toThrow("unsafe entry");
    expect(await fs.pathExists(path.join(destination, "ok.txt"))).toBe(false);
  });

  it("reports progress up to the unpacked size", async () => {
    const zipPath = writeZip({
      "a.txt": "a".repeat(1000),
      "nested/b.txt": "b".repeat(3000),
    });
    const updates: [number, number][] = [];

    await extractZip(
      zipPath,
      path.join(root, "progress"),
      undefined,
      undefined,
      (processed, total) => updates.push([processed, total]),
    );

    expect(updates[0]).toEqual([0, 4000]);
    expect(updates[updates.length - 1]).toEqual([4000, 4000]);
  });

  it("extracts many entries in parallel without mixing their contents", async () => {
    const entries: Record<string, string> = {};
    for (let index = 0; index < 120; index++) {
      entries[`group-${index % 7}/file-${index}.txt`] =
        `content ${index} `.repeat(50 + index);
    }
    const zipPath = writeZip(entries);
    const destination = path.join(root, "many");

    await extractZip(zipPath, destination);

    for (const [name, content] of Object.entries(entries)) {
      expect(await fs.readFile(path.join(destination, name), "utf-8")).toBe(
        content,
      );
    }
  });

  it("leaves out the entries the caller asks to skip", async () => {
    const zipPath = writeZip({
      "saves/Keep/level.dat": "old",
      "config/mod.toml": "a=1",
    });
    const destination = path.join(root, "instance");

    await extractZip(zipPath, destination, undefined, (name) =>
      name.startsWith("saves/Keep/"),
    );

    expect(
      await fs.pathExists(path.join(destination, "saves", "Keep", "level.dat")),
    ).toBe(false);
    expect(
      await fs.readFile(path.join(destination, "config", "mod.toml"), "utf-8"),
    ).toBe("a=1");
  });

  it("reports archiving progress while a zip is written", async () => {
    const source = path.join(root, "source.bin");
    await fs.writeFile(source, Buffer.alloc(64 * 1024, 7));
    const updates: number[] = [];

    await createZipArchive(
      [source],
      path.join(root, "packed.zip"),
      root,
      6,
      undefined,
      undefined,
      (processed) => updates.push(processed),
    );

    expect(updates[updates.length - 1]).toBe(64 * 1024);
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
