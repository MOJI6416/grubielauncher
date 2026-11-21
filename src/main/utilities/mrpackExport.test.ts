import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectType, Provider } from "@/types/ModManager";
import type { MrpackIndex } from "@/shared/instanceExport";
import { exportMrpack, pickMrpackEntries } from "./mrpackExport";
import { LARGE_ARCHIVE_LIMITS, listZipEntries, readJSONFromArchive } from "./archiver";

const roots: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grubie-mrpack-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root: string, relative: string, data: string | Buffer) {
  const file = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function sha1(data: string) {
  return createHash("sha1").update(data).digest("hex");
}

function modrinthMod(filename: string, data: string, sha?: string) {
  return {
    title: filename,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    id: filename,
    version: {
      id: "v1",
      dependencies: [],
      files: [
        {
          filename,
          size: data.length,
          sha1: sha ?? sha1(data),
          url: `https://cdn.modrinth.com/data/abc/versions/v1/${filename}`,
          isServer: true,
        },
      ],
    },
  };
}

function makeInstance() {
  const root = tempDir();
  const versionPath = path.join(root, "Pack");
  write(versionPath, "mods/sodium.jar", "sodium");
  write(versionPath, "mods/changed.jar", "edited locally");
  write(versionPath, "mods/private.jar", "local mod");
  write(versionPath, "config/sodium.json", "{}");
  write(versionPath, "options.txt", "lang:ru_ru");
  write(versionPath, "saves/Home/level.dat", "home");
  write(versionPath, "saves/Other/level.dat", "other");
  write(versionPath, "logs/latest.log", "secret");
  write(versionPath, "servers.dat", "servers");
  write(versionPath, "1.21.1.jar", "client");
  write(
    versionPath,
    "version.json",
    JSON.stringify({
      name: "Pack",
      description: "Friends pack",
      build: 3,
      version: { id: "1.21.1" },
      loader: {
        name: "fabric",
        version: { id: "0.16.9", url: "" },
        mods: [
          modrinthMod("sodium.jar", "sodium"),
          modrinthMod("changed.jar", "original", sha1("original")),
        ],
      },
    }),
  );
  return { root, versionPath };
}

describe("exportMrpack", () => {
  it("links Modrinth files and packs the rest as overrides", async () => {
    const { root, versionPath } = makeInstance();
    const output = path.join(root, "Pack.mrpack");

    const result = await exportMrpack(
      versionPath,
      ["mods", "config", "options.txt", "saves/Home", "logs", "version.json", "../escape"],
      output,
    );

    expect(result).toEqual({ linked: 1, packed: 2 });

    const index = await readJSONFromArchive<MrpackIndex>(output, "modrinth.index.json");
    expect(index?.dependencies).toEqual({ minecraft: "1.21.1", "fabric-loader": "0.16.9" });
    expect(index?.name).toBe("Pack");
    expect(index?.summary).toBe("Friends pack");
    expect(index?.files).toHaveLength(1);
    expect(index?.files[0].path).toBe("mods/sodium.jar");
    expect(index?.files[0].hashes.sha1).toBe(sha1("sodium"));
    expect(index?.files[0].hashes.sha512).toHaveLength(128);

    const names = (await listZipEntries(output, LARGE_ARCHIVE_LIMITS))
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.name)
      .sort();
    expect(names).toEqual([
      "modrinth.index.json",
      "overrides/config/sodium.json",
      "overrides/mods/changed.jar",
      "overrides/mods/private.jar",
      "overrides/options.txt",
      "overrides/saves/Home/level.dat",
    ]);
  });

  it("refuses loaders the Modrinth format cannot describe", async () => {
    const { root, versionPath } = makeInstance();
    const conf = JSON.parse(fs.readFileSync(path.join(versionPath, "version.json"), "utf8"));
    conf.loader.name = "legacy-fabric";
    fs.writeFileSync(path.join(versionPath, "version.json"), JSON.stringify(conf));

    await expect(exportMrpack(versionPath, ["mods"], path.join(root, "x.mrpack"))).rejects.toThrow(
      /legacy-fabric/,
    );
    expect(fs.existsSync(path.join(root, "x.mrpack"))).toBe(false);
  });
});

describe("pickMrpackEntries", () => {
  it("drops technical, private, hidden and escaping entries", () => {
    expect(
      pickMrpackEntries([
        "mods",
        "mods",
        "server",
        "storage",
        "version.json",
        "logs",
        "saves/../x",
        "saves\\World",
        "./config/",
      ]),
    ).toEqual(["mods", "saves/World", "config"]);
  });
});
