import os from "os";
import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.env.TEMP || process.env.TMPDIR || "/tmp"),
  },
}));

vi.mock("../services/CurseForge", () => ({
  CurseForge: { getMods: vi.fn(), getFiles: vi.fn(), getFile: vi.fn() },
}));

vi.mock("../services/Modrinth", () => ({
  Modrinth: { getProjects: vi.fn() },
}));

import { readInstanceLoaderRequirements } from "./loaderRequirements";

let root = "";

function writeMod(name: string, files: Record<string, string>) {
  const zip = new AdmZip();
  for (const [entry, content] of Object.entries(files)) {
    zip.addFile(entry, Buffer.from(content, "utf-8"));
  }
  zip.writeZip(path.join(root, "mods", name));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-loader-req-"));
  await fs.ensureDir(path.join(root, "mods"));
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("readInstanceLoaderRequirements", () => {
  it("collects Fabric loader ranges and skips mods that declare none", async () => {
    writeMod("sodium.jar", {
      "fabric.mod.json": JSON.stringify({
        id: "sodium",
        name: "Sodium",
        depends: { fabricloader: ">=0.16.0", minecraft: "1.21.1" },
      }),
    });
    writeMod("either.jar", {
      "fabric.mod.json": JSON.stringify({
        id: "either",
        depends: { fabricloader: [">=0.17", "~0.16.5"] },
      }),
    });
    writeMod("plain.jar", {
      "fabric.mod.json": JSON.stringify({
        id: "plain",
        depends: { minecraft: "*" },
      }),
    });
    await fs.writeFile(path.join(root, "mods", "off.jar.disabled"), "");

    const scan = await readInstanceLoaderRequirements(root, "fabric");

    expect(scan.scanned).toBe(3);
    expect(scan.requirements).toEqual([
      {
        file: "either.jar",
        modId: "either",
        name: null,
        syntax: "semver",
        ranges: [">=0.17", "~0.16.5"],
      },
      {
        file: "sodium.jar",
        modId: "sodium",
        name: "Sodium",
        syntax: "semver",
        ranges: [">=0.16.0"],
      },
    ]);
  });

  it("reads required Quilt loader constraints only", async () => {
    writeMod("qsl.jar", {
      "quilt.mod.json": JSON.stringify({
        quilt_loader: {
          id: "qsl",
          metadata: { name: "QSL" },
          depends: [
            "minecraft",
            { id: "quilt_loader", versions: { any: [">=0.19.0"] } },
            { id: "quilt_loader", versions: ">=1.0", optional: true },
          ],
        },
      }),
    });

    const scan = await readInstanceLoaderRequirements(root, "quilt");

    expect(scan.requirements).toEqual([
      {
        file: "qsl.jar",
        modId: "qsl",
        name: "QSL",
        syntax: "semver",
        ranges: [">=0.19.0"],
      },
    ]);
  });

  it("reads the Forge and NeoForge dependency on the loader itself", async () => {
    writeMod("create.jar", {
      "META-INF/mods.toml": [
        'modLoader="javafml"',
        'loaderVersion="[47,)"',
        "[[mods]]",
        'modId="create"',
        'displayName="Create"',
        "[[dependencies.create]]",
        'modId="forge"',
        "mandatory=true",
        'versionRange="[47.1.3,)"',
        'side="BOTH"',
        "[[dependencies.create]]",
        'modId="flywheel"',
        "mandatory=true",
        'versionRange="[0.6,)"',
        'side="CLIENT"',
      ].join("\n"),
    });
    writeMod("mekanism.jar", {
      "META-INF/neoforge.mods.toml": [
        'modLoader="javafml"',
        "[[mods]]",
        'modId="mekanism"',
        "[[dependencies.mekanism]]",
        'modId="neoforge"',
        'type="required"',
        'versionRange="[21.1.77,)"',
        'side="BOTH"',
        "[[dependencies.mekanism]]",
        'modId="neoforge"',
        'type="optional"',
        'versionRange="[99,)"',
        'side="BOTH"',
      ].join("\n"),
    });

    const forge = await readInstanceLoaderRequirements(root, "forge");
    const neoforge = await readInstanceLoaderRequirements(root, "neoforge");

    expect(forge.requirements).toEqual([
      {
        file: "create.jar",
        modId: "create",
        name: "Create",
        syntax: "maven",
        ranges: ["[47.1.3,)"],
      },
    ]);
    expect(neoforge.requirements).toEqual([
      {
        file: "mekanism.jar",
        modId: "mekanism",
        name: null,
        syntax: "maven",
        ranges: ["[21.1.77,)"],
      },
    ]);
  });

  it("returns nothing for vanilla or an instance without a mods folder", async () => {
    expect(await readInstanceLoaderRequirements(root, "vanilla")).toEqual({
      scanned: 0,
      requirements: [],
    });

    await fs.remove(path.join(root, "mods"));
    expect(await readInstanceLoaderRequirements(root, "fabric")).toEqual({
      scanned: 0,
      requirements: [],
    });
  });
});
