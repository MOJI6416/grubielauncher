import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() },
}));

import {
  dataDir,
  defaultMinecraftDir,
  legacyOwner,
  staticCandidates,
  tlauncherHome,
  curseForgeRootOverride,
} from "./locate";
import { detectFolder, foreignInstanceById, scanCandidates } from "./scan";
import { tempDir, useFixture } from "./fixtures.testutil";

const cleanup: string[] = [];

afterEach(async () => {
  for (const dir of cleanup.splice(0)) await fs.remove(dir);
});

async function fixture(name: string) {
  const dir = await useFixture(name);
  cleanup.push(dir);
  return dir;
}

describe("default launcher locations", () => {
  const home = path.join("/", "home", "steve");

  it("knows where each OS keeps launcher data", () => {
    expect(dataDir({ platform: "win32", home: "C:\\Users\\steve", appData: "C:\\Users\\steve\\AppData\\Roaming" })).toBe(
      "C:\\Users\\steve\\AppData\\Roaming",
    );
    expect(dataDir({ platform: "darwin", home })).toBe(path.join(home, "Library", "Application Support"));
    expect(dataDir({ platform: "linux", home })).toBe(path.join(home, ".local", "share"));
    expect(dataDir({ platform: "linux", home, xdgDataHome: "/data" })).toBe("/data");

    expect(defaultMinecraftDir({ platform: "linux", home })).toBe(path.join(home, ".minecraft"));
    expect(defaultMinecraftDir({ platform: "darwin", home })).toBe(
      path.join(home, "Library", "Application Support", "minecraft"),
    );
    expect(tlauncherHome({ platform: "linux", home })).toBe(path.join(home, ".tlauncher"));
    expect(tlauncherHome({ platform: "darwin", home })).toBe(
      path.join(home, "Library", "Application Support", "tlauncher"),
    );
  });

  it("lists every supported launcher", () => {
    const kinds = staticCandidates({ platform: "linux", home }).map((candidate) => candidate.kind);
    expect(new Set(kinds)).toEqual(
      new Set(["mmc", "atlauncher", "gdlegacy", "gdcarbon", "curseforge", "modrinth"]),
    );
    const roots = staticCandidates({ platform: "linux", home }).map((candidate) => candidate.root);
    expect(roots).toContain(path.join(home, ".local", "share", "PrismLauncher"));
    expect(roots).toContain(path.join(home, "curseforge", "minecraft"));
    expect(roots).toContain(
      path.join(home, ".var", "app", "org.prismlauncher.PrismLauncher", "data", "PrismLauncher"),
    );
  });

  it("reads a moved CurseForge folder from storage.json", async () => {
    const userHome = await tempDir("cf-home");
    cleanup.push(userHome);
    await fs.outputJSON(path.join(userHome, ".config", "CurseForge", "storage.json"), {
      "minecraft-settings": JSON.stringify({ minecraftRoot: "/games/curseforge" }),
    });
    expect(await curseForgeRootOverride({ platform: "linux", home: userHome })).toBe("/games/curseforge");
  });

  it("maps Legacy Launcher separate folders by family or by version", () => {
    const family = legacyOwner({ "minecraft.gamedir.separate": "family" }, "/g");
    expect(family.gameDirFor?.("Forge 1.12.2", { family: "Forge-1.12" })).toBe(path.join("/g", "home", "Forge-1.12"));
    expect(family.gameDirFor?.("1.8.9", {})).toBeUndefined();
    expect(family.gameDirFor?.("x", { family: "../up" })).toBeUndefined();

    const version = legacyOwner({ "minecraft.gamedir.separate": "version" }, "/g");
    expect(version.gameDirFor?.("1.8.9", {})).toBe(path.join("/g", "home", "1.8.9"));

    expect(legacyOwner({ "minecraft.gamedir.separate": "true" }, "/g").gameDirFor?.("x", { family: "F" })).toBe(
      path.join("/g", "home", "F"),
    );
    expect(legacyOwner({}, "/g").gameDirFor).toBeUndefined();
    expect(legacyOwner({ "minecraft.xmx": "auto" }, "/g").memoryMb).toBeUndefined();
  });
});

describe("detectFolder", () => {
  it("recognises launcher roots, instance folders and .minecraft", async () => {
    const prism = await fixture("prism");
    expect(await detectFolder(prism)).toEqual([{ kind: "mmc", launcher: "prism", root: prism }]);

    const single = path.join(prism, "instances", "Fabric Pack");
    expect(await detectFolder(single)).toEqual([
      { kind: "mmc", launcher: "prism", root: prism, instancesDir: path.join(prism, "instances") },
    ]);

    const curseforge = await fixture("curseforge");
    expect(await detectFolder(curseforge)).toEqual([{ kind: "curseforge", root: curseforge }]);

    const official = await fixture("official");
    const [minecraft] = await detectFolder(official);
    expect(minecraft).toMatchObject({ kind: "minecraft", root: official });

    const empty = await tempDir("empty");
    cleanup.push(empty);
    expect(await detectFolder(empty)).toEqual([]);
  });
});

describe("scanCandidates", () => {
  it("collects instances once, sorted by launcher, and keeps them for later steps", async () => {
    const prism = await fixture("prism");
    const curseforge = await fixture("curseforge");

    const result = await scanCandidates([
      { kind: "curseforge", root: curseforge },
      { kind: "mmc", launcher: "prism", root: prism },
      { kind: "mmc", launcher: "prism", root: prism },
      { kind: "mmc", launcher: "multimc", root: prism },
    ]);

    expect(result.instances.map((instance) => instance.launcher)).toEqual([
      "prism",
      "prism",
      "curseforge",
      "curseforge",
      "curseforge",
    ]);
    const fabric = result.instances.find((instance) => instance.name === "Мой Fabric")!;
    expect(fabric).toMatchObject({
      counts: { mods: 2, worlds: 1, screenshots: 1, packs: 1 },
      memoryMb: 4096,
      hasJvmArgs: true,
      sharedGameDir: false,
    });
    expect(fabric.icon).toMatch(/^data:image\/png;base64,/);
    expect(foreignInstanceById(fabric.id)?.gameDir).toBe(
      path.join(prism, "instances", "Fabric Pack", ".minecraft"),
    );
    expect(result.roots).toEqual(
      expect.arrayContaining([
        { launcher: "prism", root: prism },
        { launcher: "curseforge", root: curseforge },
      ]),
    );
  });

  it("skips anything inside the launcher's own data folder", async () => {
    const prism = await fixture("prism");
    const result = await scanCandidates([{ kind: "mmc", launcher: "prism", root: prism }], path.dirname(prism));
    expect(result.instances).toEqual([]);
  });

  it("survives a launcher folder it cannot read", async () => {
    const result = await scanCandidates([
      { kind: "atlauncher", root: path.join(os.tmpdir(), "grubie-missing-launcher") },
      { kind: "modrinth", root: path.join(os.tmpdir(), "grubie-missing-modrinth") },
    ]);
    expect(result.instances).toEqual([]);
  });
});
