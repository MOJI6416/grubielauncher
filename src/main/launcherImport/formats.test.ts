import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() },
}));

import { scanMmcRoot } from "./formats/mmc";
import { scanAtLauncherRoot } from "./formats/atlauncher";
import { carbonRuntimeRoot, scanGdCarbonRoot, scanGdLegacyRoot } from "./formats/gdlauncher";
import { parseCurseForgeLoader, scanCurseForgeRoot } from "./formats/curseforge";
import { scanModrinthRoot } from "./formats/modrinth";
import { detectVersionLoader, scanMinecraftRoot } from "./formats/vanilla";
import { minecraftCandidates } from "./locate";
import { parseIni, parseProperties, splitArguments } from "./common";
import { buildSqlite, escapeProperty, tempDir, useFixture } from "./fixtures.testutil";

const cleanup: string[] = [];

async function fixture(name: string) {
  const dir = await useFixture(name);
  cleanup.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of cleanup.splice(0)) await fs.remove(dir);
});

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`no ${name} in ${items.map((item) => item.name).join(", ")}`);
  return found;
}

describe("config parsers", () => {
  it("reads Qt ini with sections, quotes and \\x escapes, case-insensitive keys", () => {
    const ini = parseIni('[General]\nname=\\x41f\\x440\\x438\nJvmArgs="-Da=b -Dc=d"\n; comment\n');
    expect(ini).toEqual({ name: "При", jvmargs: "-Da=b -Dc=d" });
  });

  it("reads Java properties with escaped paths", () => {
    const props = parseProperties(
      "#comment\nminecraft.gamedir=C\\:\\\\Games\\\\.minecraft\nminecraft.memory.ram2 = 3072\nkey\\ with\\ space=v\n",
    );
    expect(props["minecraft.gamedir"]).toBe("C:\\Games\\.minecraft");
    expect(props["minecraft.memory.ram2"]).toBe("3072");
    expect(props["key with space"]).toBe("v");
  });

  it("splits launch arguments with quotes", () => {
    expect(splitArguments(`-Xmx4G "-Dname=a b" -XX:+UseG1GC ''`)).toEqual([
      "-Xmx4G",
      "-Dname=a b",
      "-XX:+UseG1GC",
      "",
    ]);
  });
});

describe("Prism Launcher and MultiMC", () => {
  it("lists Prism instances with loader, game folder, icon, memory and JVM", async () => {
    const root = await fixture("prism");
    const instances = await scanMmcRoot(root, "prism");

    expect(instances.map((instance) => instance.name).sort()).toEqual(["Old Forge", "Мой Fabric"]);

    const fabric = byName(instances, "Мой Fabric");
    expect(fabric).toMatchObject({
      launcher: "prism",
      minecraftVersion: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.15.11",
      gameDir: path.join(root, "instances", "Fabric Pack", ".minecraft"),
      iconPath: path.join(root, "icons", "fabricpack.png"),
      memoryMb: 4096,
      jvmArgs: ["-XX:+UseZGC", "-Dsodium.checks=false"],
      lastPlayed: 1717200000000,
      prismLayout: true,
      sharedGameDir: false,
    });

    const forge = byName(instances, "Old Forge");
    expect(forge).toMatchObject({
      loader: "forge",
      loaderVersion: "14.23.5.2860",
      minecraftVersion: "1.12.2",
      gameDir: path.join(root, "instances", "Old Forge", "minecraft"),
      memoryMb: 6144,
      jvmArgs: ["-XX:+UseG1GC", "-Dfml.ignorePatchDiscrepancies=true"],
      iconPath: undefined,
    });
  });

  it("reads MultiMC legacy overrides and mixed-case keys", async () => {
    const root = await fixture("multimc");
    const [instance] = await scanMmcRoot(root, "multimc");

    expect(instance).toMatchObject({
      launcher: "multimc",
      name: "PvP 1.8.9",
      minecraftVersion: "1.8.9",
      loader: "vanilla",
      memoryMb: 3072,
      jvmArgs: ["-XX:+UseG1GC"],
    });
  });

  it("honours a custom instance folder from the launcher config", async () => {
    const root = await fixture("prism");
    await fs.move(path.join(root, "instances"), path.join(root, "elsewhere"));
    await fs.writeFile(path.join(root, "prismlauncher.cfg"), "[General]\nInstanceDir=elsewhere\n");

    expect(await scanMmcRoot(root, "prism")).toHaveLength(2);
  });
});

describe("ATLauncher", () => {
  it("reads instance.json with own and global memory settings", async () => {
    const root = await fixture("atlauncher");
    const instances = await scanAtLauncherRoot(root);

    const atm = byName(instances, "All the Mods 8");
    expect(atm).toMatchObject({
      launcher: "atlauncher",
      minecraftVersion: "1.19.2",
      loader: "forge",
      loaderVersion: "43.2.0",
      memoryMb: 8192,
      jvmArgs: ["-XX:+UseG1GC", "-XX:MaxGCPauseMillis=50"],
      iconPath: path.join(root, "configs", "images", "allthemods8.png"),
      disabledModsDir: path.join(root, "instances", "AllTheMods8", "disabledmods"),
      lastPlayed: 1717300000000,
    });

    const plus = byName(instances, "Vanilla Plus");
    expect(plus).toMatchObject({
      loader: "fabric",
      loaderVersion: "0.16.9",
      memoryMb: 3072,
      jvmArgs: ["-XX:+UseZGC"],
      iconPath: path.join(root, "instances", "VanillaPlus", "instance.png"),
    });
  });
});

describe("GDLauncher", () => {
  it("reads the legacy config.json and strips the Minecraft prefix from Forge", async () => {
    const root = await fixture("gdlauncher_next");
    const instances = await scanGdLegacyRoot(root);

    expect(byName(instances, "My Pack")).toMatchObject({
      launcher: "gdlauncher",
      minecraftVersion: "1.16.5",
      loader: "forge",
      loaderVersion: "36.2.39",
      memoryMb: 5000,
      jvmArgs: ["-Xss2m"],
      iconPath: path.join(root, "instances", "My Pack", "background.png"),
      skipEntries: ["config.json", "background.png"],
    });
    expect(byName(instances, "Vanilla")).toMatchObject({ loader: "vanilla", minecraftVersion: "1.20.4" });
  });

  it("reads GDLauncher Carbon instances from the runtime folder", async () => {
    const appData = await fixture("gdlauncher_carbon");
    const runtime = await carbonRuntimeRoot(appData);
    expect(runtime).toBe(path.join(appData, "data"));

    const instances = await scanGdCarbonRoot(runtime);
    expect(byName(instances, "Карбон")).toMatchObject({
      minecraftVersion: "1.21.1",
      loader: "neoforge",
      loaderVersion: "21.1.72",
      gameDir: path.join(runtime, "instances", "inst1", "instance"),
      memoryMb: 6144,
      jvmArgs: ["-XX:+UseZGC"],
      iconPath: path.join(runtime, "instances", "inst1", "icon.png"),
      lastPlayed: Date.parse("2024-06-01T12:00:00Z"),
    });
    expect(byName(instances, "Standard")).toMatchObject({ loader: "fabric", loaderVersion: "0.15.11" });
  });

  it("follows runtime_path_override", async () => {
    const appData = await fixture("gdlauncher_carbon");
    const moved = await tempDir("carbon-moved");
    cleanup.push(moved);
    await fs.writeFile(path.join(appData, "runtime_path_override"), moved);
    expect(await carbonRuntimeRoot(appData)).toBe(moved);
  });
});

describe("CurseForge App", () => {
  it("parses loader names", () => {
    expect(parseCurseForgeLoader("forge-47.2.0", "1.20.1")).toEqual({ loader: "forge", loaderVersion: "47.2.0" });
    expect(parseCurseForgeLoader("fabric-0.16.9-1.21.1", "1.21.1")).toEqual({ loader: "fabric", loaderVersion: "0.16.9" });
    expect(parseCurseForgeLoader("quilt-0.26.0-1.20.1", "1.20.1")).toEqual({ loader: "quilt", loaderVersion: "0.26.0" });
    expect(parseCurseForgeLoader("neoforge-1.20.1-47.1.106", "1.20.1")).toEqual({ loader: "neoforge", loaderVersion: "47.1.106" });
    expect(parseCurseForgeLoader("forge", "1.20.1")).toEqual({ loader: "forge" });
    expect(parseCurseForgeLoader(undefined, "1.20.1")).toEqual({ loader: "vanilla" });
    expect(parseCurseForgeLoader("liteloader-1.12.2", "1.12.2")).toBeNull();
  });

  it("reads minecraftinstance.json and the memory override", async () => {
    const root = await fixture("curseforge");
    const instances = await scanCurseForgeRoot(root);

    expect(byName(instances, "Create Pack")).toMatchObject({
      launcher: "curseforge",
      minecraftVersion: "1.20.1",
      loader: "forge",
      loaderVersion: "47.2.0",
      memoryMb: 6144,
      jvmArgs: ["-XX:+UseG1GC"],
      lastPlayed: Date.parse("2024-05-01T10:00:00Z"),
      skipEntries: ["minecraftinstance.json", ".curseclient"],
    });
    expect(byName(instances, "Fabric Fun")).toMatchObject({ loader: "fabric", memoryMb: undefined });
    expect(byName(instances, "Plain")).toMatchObject({ loader: "vanilla", minecraftVersion: "1.21.4" });
  });
});

describe("Modrinth App", () => {
  it("reads instances, content sets and launch overrides from app.db", async () => {
    const root = await fixture("modrinth");
    await buildSqlite(path.join(root, "app.sql"), path.join(root, "app.db"));

    const instances = await scanModrinthRoot(root);
    expect(instances.map((instance) => instance.name)).toEqual(["Fabulously Optimized", "Neo Pack"]);
    expect(byName(instances, "Fabulously Optimized")).toMatchObject({
      launcher: "modrinth",
      minecraftVersion: "1.21.1",
      loader: "fabric",
      loaderVersion: "0.16.9",
      gameDir: path.join(root, "profiles", "Fabulously Optimized"),
      memoryMb: 6144,
      jvmArgs: ["-XX:+UseZGC"],
      lastPlayed: 1717400000000,
    });
    expect(byName(instances, "Neo Pack")).toMatchObject({
      loader: "neoforge",
      loaderVersion: "21.1.72",
      memoryMb: 4096,
      jvmArgs: ["-XX:+UseG1GC"],
    });
  });

  it("reads the pre-2026 profiles table", async () => {
    const root = await fixture("modrinth");
    await buildSqlite(path.join(root, "app-legacy.sql"), path.join(root, "app.db"));

    const [instance] = await scanModrinthRoot(root);
    expect(instance).toMatchObject({
      name: "FO legacy",
      minecraftVersion: "1.20.4",
      loader: "quilt",
      loaderVersion: "0.26.0",
      memoryMb: 3000,
      jvmArgs: ["-XX:+UseG1GC"],
    });
  });

  it("returns nothing for a broken database", async () => {
    const root = await fixture("modrinth");
    await fs.writeFile(path.join(root, "app.db"), "not a database");
    expect(await scanModrinthRoot(root)).toEqual([]);
  });
});

describe("official launcher (.minecraft/versions)", () => {
  it("detects loaders from version jsons", () => {
    expect(
      detectVersionLoader(
        { id: "x", libraries: [{ name: "net.fabricmc:fabric-loader:0.15.11" }, { name: "net.fabricmc:intermediary:1.20.1" }] },
      ),
    ).toEqual({ minecraftVersion: "1.20.1", loader: "fabric", loaderVersion: "0.15.11" });
    expect(
      detectVersionLoader({ id: "x", libraries: [{ name: "net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10" }] }),
    ).toEqual({ minecraftVersion: "1.7.10", loader: "forge", loaderVersion: "10.13.4.1614" });
    expect(
      detectVersionLoader({ id: "x", libraries: [{ name: "net.neoforged:forge:1.20.1-47.1.106" }] }),
    ).toEqual({ minecraftVersion: "1.20.1", loader: "neoforge", loaderVersion: "47.1.106" });
    expect(
      detectVersionLoader({ id: "q", inheritsFrom: "1.20.1", libraries: [{ name: "org.quiltmc:quilt-loader:0.26.0" }] }, "1.20.1"),
    ).toEqual({ minecraftVersion: "1.20.1", loader: "quilt", loaderVersion: "0.26.0" });
    expect(detectVersionLoader({ id: "1.8.9" })).toEqual({ minecraftVersion: "1.8.9", loader: "vanilla" });
  });

  it("lists profiles and installed versions, skipping parents of loader versions", async () => {
    const root = await fixture("official");
    const instances = await scanMinecraftRoot(root, [{ launcher: "official" }]);

    expect(instances.map((instance) => instance.name).sort()).toEqual([
      "1.20.1-forge-47.2.0",
      "1.8.9",
      "Fabric 1.20.1",
      "Old one",
      "neoforge-21.1.72",
    ]);

    const fabric = byName(instances, "Fabric 1.20.1");
    expect(fabric).toMatchObject({
      launcher: "official",
      minecraftVersion: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.15.11",
      gameDir: root,
      sharedGameDir: true,
      skipMods: false,
      memoryMb: 4096,
      jvmArgs: ["-Xmx4G", "-XX:+UnlockExperimentalVMOptions", "-XX:+UseG1GC"],
      lastPlayed: Date.parse("2024-06-02T08:00:00.000Z"),
    });
    expect(fabric.iconData).toMatch(/^data:image\/png;base64,/);

    expect(byName(instances, "Old one")).toMatchObject({
      loader: "forge",
      loaderVersion: "14.23.5.2860",
      minecraftVersion: "1.12.2",
      iconData: undefined,
    });
    expect(byName(instances, "1.20.1-forge-47.2.0")).toMatchObject({ loader: "forge", loaderVersion: "47.2.0" });
    expect(byName(instances, "neoforge-21.1.72")).toMatchObject({
      loader: "neoforge",
      loaderVersion: "21.1.72",
      minecraftVersion: "1.21.1",
    });
    expect(byName(instances, "1.8.9")).toMatchObject({ loader: "vanilla", skipMods: true });
  });

  it("uses a profile's own game folder", async () => {
    const root = await fixture("official");
    const own = await tempDir("profile-dir");
    cleanup.push(own);
    const file = path.join(root, "launcher_profiles.json");
    const data = await fs.readJSON(file);
    data.profiles.fabric.gameDir = own;
    await fs.writeJSON(file, data);

    const fabric = byName(await scanMinecraftRoot(root, [{ launcher: "official" }]), "Fabric 1.20.1");
    expect(fabric).toMatchObject({ gameDir: own, sharedGameDir: false, skipMods: false });
  });
});

describe("TLauncher and Legacy Launcher", () => {
  async function home() {
    const dir = await tempDir("home");
    cleanup.push(dir);
    return dir;
  }

  it("finds TLauncher through its settings and splits off modpack folders", async () => {
    const userHome = await home();
    const gameRoot = path.join(await fixture("tlauncher"), "game");
    await fs.outputFile(
      path.join(userHome, ".tlauncher", "tlauncher-2.0.properties"),
      `minecraft.gamedir=${escapeProperty(gameRoot)}\nminecraft.memory.ram2=3072\nminecraft.javaargs=-XX:+UseG1GC\n`,
    );

    const candidates = await minecraftCandidates({ platform: "linux", home: userHome });
    expect(candidates).toHaveLength(1);
    const [candidate] = candidates;
    if (candidate.kind !== "minecraft") throw new Error("unexpected candidate");
    expect(candidate.root).toBe(gameRoot);
    expect(candidate.owners.map((owner) => owner.launcher)).toEqual(["tlauncher"]);

    const instances = await scanMinecraftRoot(candidate.root, candidate.owners);
    expect(instances.map((instance) => instance.name).sort()).toEqual([
      "Fabric 1.20.1",
      "ForgeOptiFine 1.20.1",
      "MyPack",
    ]);
    expect(byName(instances, "Fabric 1.20.1")).toMatchObject({
      launcher: "tlauncher",
      minecraftVersion: "1.20.1",
      loader: "fabric",
      gameDir: gameRoot,
      sharedGameDir: true,
      memoryMb: 3072,
      jvmArgs: ["-XX:+UseG1GC"],
    });
    expect(byName(instances, "ForgeOptiFine 1.20.1")).toMatchObject({
      loader: "forge",
      loaderVersion: "47.2.0",
      minecraftVersion: "1.20.1",
    });
    expect(byName(instances, "MyPack")).toMatchObject({
      loader: "fabric",
      minecraftVersion: "1.19.2",
      gameDir: path.join(gameRoot, "versions", "MyPack"),
      sharedGameDir: false,
      skipEntries: ["MyPack.json", "MyPack.jar", "TLauncherAdditional.json"],
    });
  });

  it("finds Legacy Launcher and its per-family game folders", async () => {
    const userHome = await home();
    const gameRoot = path.join(await fixture("legacy"), "game");
    await fs.outputFile(
      path.join(userHome, ".tlauncher", "legacy", "Minecraft", "tl.properties"),
      `minecraft.gamedir=${escapeProperty(gameRoot)}\nminecraft.xmx=2048\nminecraft.gamedir.separate=family\n`,
    );

    const [candidate] = await minecraftCandidates({ platform: "linux", home: userHome });
    if (candidate?.kind !== "minecraft") throw new Error("unexpected candidate");
    expect(candidate.owners.map((owner) => owner.launcher)).toEqual(["legacy"]);

    const [forge] = await scanMinecraftRoot(candidate.root, candidate.owners);
    expect(forge).toMatchObject({
      launcher: "legacy",
      name: "Forge 1.16.5",
      minecraftVersion: "1.16.5",
      loader: "forge",
      loaderVersion: "36.2.39",
      gameDir: path.join(gameRoot, "home", "Forge-1.16"),
      sharedGameDir: false,
      memoryMb: 2048,
    });
  });

  it("splits a shared .minecraft between TLauncher and the official launcher", async () => {
    const userHome = await home();
    const minecraft = path.join(userHome, ".minecraft");
    await useFixture("official", minecraft);
    await fs.copy(
      path.join(await fixture("tlauncher"), "game", "versions", "Fabric 1.20.1"),
      path.join(minecraft, "versions", "Fabric 1.20.1"),
    );
    await fs.outputFile(path.join(userHome, ".tlauncher", "tlauncher-2.0.properties"), "minecraft.memory.ram2=2048\n");

    const [candidate] = await minecraftCandidates({ platform: "linux", home: userHome });
    if (candidate?.kind !== "minecraft") throw new Error("unexpected candidate");
    expect(candidate.owners.map((owner) => owner.launcher).sort()).toEqual(["official", "tlauncher"]);

    const instances = await scanMinecraftRoot(candidate.root, candidate.owners);
    const byFolder = (folder: string) =>
      instances.find((instance) => path.basename(instance.instanceDir) === folder);
    expect(byFolder("fabric-loader-0.15.11-1.20.1")?.launcher).toBe("official");
    expect(byFolder("Fabric 1.20.1")).toMatchObject({ launcher: "tlauncher", memoryMb: 2048 });
    expect(byFolder("1.8.9")?.launcher).toBe("official");
  });
});
