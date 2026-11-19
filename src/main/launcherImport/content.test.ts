import os from "os";
import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() },
}));

import type { ImportPart } from "@/types/LauncherImport";
import { IMPORT_PARTS } from "@/types/LauncherImport";
import { collectCopyItems, copyItems, partOfEntry, totalBytes } from "./content";
import { scanMmcRoot } from "./formats/mmc";
import { scanAtLauncherRoot } from "./formats/atlauncher";
import { scanMinecraftRoot } from "./formats/vanilla";
import { tempDir, useFixture } from "./fixtures.testutil";

const cleanup: string[] = [];
const ALL = new Set<ImportPart>(IMPORT_PARTS);

afterEach(async () => {
  for (const dir of cleanup.splice(0)) await fs.remove(dir);
});

async function fixture(name: string) {
  const dir = await useFixture(name);
  cleanup.push(dir);
  return dir;
}

async function fingerprint(root: string): Promise<string> {
  const hash = createHash("sha1");
  const walk = async (dir: string) => {
    for (const name of (await fs.readdir(dir)).sort()) {
      const full = path.join(dir, name);
      const stat = await fs.stat(full);
      hash.update(`${path.relative(root, full)}|${stat.size}|${stat.mtimeMs}`);
      if (stat.isDirectory()) await walk(full);
      else hash.update(await fs.readFile(full));
    }
  };
  await walk(root);
  return hash.digest("hex");
}

function targets(items: { target: string }[]) {
  return items.map((item) => item.target.replace(/\\/g, "/")).sort();
}

async function prismFabric() {
  const root = await fixture("prism");
  const instances = await scanMmcRoot(root, "prism");
  const instance = instances.find((item) => item.loader === "fabric")!;
  await fs.outputFile(path.join(instance.gameDir, "logs", "latest.log"), "log");
  await fs.outputFile(path.join(instance.gameDir, "crash-reports", "crash.txt"), "crash");
  return { root, instance };
}

describe("partOfEntry", () => {
  it("sorts top-level entries into parts and drops launcher junk", () => {
    const plain = { sharedGameDir: false };
    expect(partOfEntry("mods", plain)).toBe("mods");
    expect(partOfEntry("saves", plain)).toBe("worlds");
    expect(partOfEntry("screenshots", plain)).toBe("screenshots");
    expect(partOfEntry("shaderpacks", plain)).toBe("packs");
    expect(partOfEntry("config", plain)).toBe("configs");
    expect(partOfEntry("options.txt", plain)).toBe("configs");
    expect(partOfEntry("millenaire", plain)).toBe("configs");
    for (const junk of ["logs", "versions", "libraries", "assets", "launcher_profiles.json", "TlauncherProfiles.json", "usercache.json", "hs_err_pid42.log", "natives"]) {
      expect(partOfEntry(junk, plain)).toBeNull();
    }
    expect(partOfEntry("home", { sharedGameDir: true })).toBeNull();
    expect(partOfEntry("home", plain)).toBe("configs");
    expect(partOfEntry("instance.json", { sharedGameDir: false, skipEntries: ["instance.json"] })).toBeNull();
  });
});

describe("collectCopyItems", () => {
  it("takes every chosen part and leaves out indexes, locks and logs", async () => {
    const { instance } = await prismFabric();
    const items = await collectCopyItems(instance, ALL);

    expect(targets(items)).toEqual([
      "config/sodium-options.json",
      "millenaire/parchments/a.txt",
      "mods/oldmod-1.0.jar.disabled",
      "mods/sodium-fabric-0.5.8.jar",
      "options.txt",
      "resourcepacks/Faithful.zip",
      "saves/Survival/level.dat",
      "saves/Survival/region/r.0.0.mca",
      "screenshots/2024-06-01_12.00.00.png",
    ]);
    expect(totalBytes(items)).toBeGreaterThan(0);
  });

  it("copies only the parts that were chosen", async () => {
    const { instance } = await prismFabric();
    expect(targets(await collectCopyItems(instance, new Set<ImportPart>(["worlds"])))).toEqual([
      "saves/Survival/level.dat",
      "saves/Survival/region/r.0.0.mca",
    ]);
    expect(await collectCopyItems(instance, new Set<ImportPart>(["memory"]))).toEqual([]);
  });

  it("brings ATLauncher's disabled mods back as .disabled files", async () => {
    const root = await fixture("atlauncher");
    const instance = (await scanAtLauncherRoot(root)).find((item) => item.loader === "forge")!;
    expect(targets(await collectCopyItems(instance, ALL))).toEqual([
      "config/create-common.toml",
      "mods/create-0.5.1.jar",
      "mods/optifine.jar.disabled",
    ]);
  });

  it("does not take shared mods into a vanilla version of .minecraft", async () => {
    const root = await fixture("official");
    const instances = await scanMinecraftRoot(root, [{ launcher: "official" }]);
    const vanilla = instances.find((item) => item.name === "1.8.9")!;
    const fabric = instances.find((item) => item.name === "Fabric 1.20.1")!;

    const vanillaTargets = targets(await collectCopyItems(vanilla, ALL));
    expect(vanillaTargets).toEqual(["options.txt", "saves/Shared World/level.dat"]);
    expect(targets(await collectCopyItems(fabric, ALL))).toContain("mods/shared-mod.jar");
  });
});

describe("copyItems", () => {
  it("copies files, keeps their dates and never touches the source", async () => {
    const { instance } = await prismFabric();
    const before = await fingerprint(instance.gameDir);
    const destination = await tempDir("copy-target");
    cleanup.push(destination);

    const progress: number[] = [];
    const items = await collectCopyItems(instance, ALL);
    const result = await copyItems(items, destination, (processed) => progress.push(processed));

    expect(result).toEqual({ copied: items.length, skipped: 0, failed: [] });
    expect(await fingerprint(instance.gameDir)).toBe(before);
    expect(progress.at(-1)).toBe(totalBytes(items));

    const level = items.find((item) => item.target.endsWith("level.dat"))!;
    const copied = await fs.stat(path.join(destination, level.target));
    expect(Math.round(copied.mtimeMs / 1000)).toBe(Math.round(level.mtime.getTime() / 1000));
    expect(await fs.readFile(path.join(destination, "options.txt"), "utf-8")).toBe(
      await fs.readFile(path.join(instance.gameDir, "options.txt"), "utf-8"),
    );
  });

  it("keeps files that already exist and refuses paths outside the target", async () => {
    const { instance } = await prismFabric();
    const destination = await tempDir("copy-existing");
    cleanup.push(destination);
    await fs.outputFile(path.join(destination, "options.txt"), "mine");

    const items = await collectCopyItems(instance, new Set<ImportPart>(["configs"]));
    items.push({ ...items[0], target: path.join("..", "escape.txt") });
    const result = await copyItems(items, destination);

    expect(result.skipped).toBe(1);
    expect(result.failed).toEqual([path.join("..", "escape.txt")]);
    expect(await fs.readFile(path.join(destination, "options.txt"), "utf-8")).toBe("mine");
    expect(await fs.pathExists(path.join(destination, "..", "escape.txt"))).toBe(false);
  });
});
