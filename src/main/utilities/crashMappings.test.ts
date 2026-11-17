import { TestZip } from "./testZip";
import { createHash } from "crypto";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("axios", () => ({ default: { get: hoisted.get } }));
vi.mock("./other", () => ({
  getLauncherPaths: () => ({ minecraft: "", cache: "" }),
}));
vi.mock("./mirrorState", () => ({
  getDownloadSource: () => "auto",
  getMojangReachable: () => true,
  isMirrorDisabled: () => false,
}));

import { deobfuscateCrashText } from "./crashMappings";

const PROGUARD = [
  "net.minecraft.client.Minecraft -> enn:",
  "    1152:1299:void runTick(boolean) -> f",
  "",
].join("\n");
const TINY = [
  "v1\tofficial\tintermediary",
  "CLASS\tenn\tnet/minecraft/class_310",
  "METHOD\tenn\t(Z)V\tf\tmethod_1523",
  "",
].join("\n");
const SHA1 = createHash("sha1").update(PROGUARD).digest("hex");
const MAPPINGS_URL = "https://piston-data.mojang.com/v1/objects/x/client.txt";
const MIRROR_URL = "https://mirror.grubielauncher.com/piston-data/v1/objects/x/client.txt";

const FABRIC_LOG = "\tat knot//net.minecraft.class_310.method_1523(class_310.java:1160)";
const FABRIC_READABLE = "\tat knot//net.minecraft.client.Minecraft.runTick(Minecraft.java:1160)";
const VANILLA_LOG = "\tat enn.f(SourceFile:1160)";

let root: string;
let paths: { versionPath: string; librariesPath: string; cachePath: string };

async function instance(loader: string, version = "1.20.1", mappings: object | null = { url: MAPPINGS_URL, sha1: SHA1, size: 1 }) {
  await fs.outputJSON(path.join(paths.versionPath, "version.json"), {
    version: { id: version },
    loader: { name: loader },
  });
  await fs.outputJSON(path.join(paths.versionPath, `${version}.json`), {
    id: version,
    downloads: mappings ? { client_mappings: mappings } : {},
  });
}

async function intermediaryJar(version = "1.20.1") {
  const zip = new TestZip();
  zip.addFile("mappings/mappings.tiny", Buffer.from(TINY));
  const jar = path.join(paths.librariesPath, "net", "fabricmc", "intermediary", version, `intermediary-${version}.jar`);
  await fs.ensureDir(path.dirname(jar));
  zip.writeZip(jar);
}

function serve(body: string = PROGUARD) {
  hoisted.get.mockImplementation(async (url: string) => {
    if (url === MAPPINGS_URL || url === MIRROR_URL) return { data: Buffer.from(body) };
    throw new Error(`unexpected ${url}`);
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "crash-mappings-"));
  paths = {
    versionPath: path.join(root, "instance"),
    librariesPath: path.join(root, "libraries"),
    cachePath: path.join(root, "cache", "mappings"),
  };
  hoisted.get.mockReset();
});

afterEach(async () => {
  await fs.remove(root);
});

describe("deobfuscateCrashText", () => {
  it("reads a Fabric crash with Mojang's mappings and the instance's own intermediary", async () => {
    await instance("fabric");
    await intermediaryJar();
    serve();

    await expect(deobfuscateCrashText(FABRIC_LOG, paths)).resolves.toBe(FABRIC_READABLE);
    expect(await fs.readFile(path.join(paths.cachePath, `${SHA1}.txt`), "utf-8")).toBe(PROGUARD);
  });

  it("downloads Mojang's file once and reads it from the cache after that", async () => {
    await instance("vanilla");
    serve();

    await deobfuscateCrashText(VANILLA_LOG, paths);
    await expect(deobfuscateCrashText(VANILLA_LOG, paths)).resolves.toBe(
      "\tat net.minecraft.client.Minecraft.runTick(Minecraft.java:1160)",
    );
    expect(hoisted.get).toHaveBeenCalledTimes(1);
  });

  it("falls back to the mirror when Mojang's host fails", async () => {
    await instance("vanilla");
    hoisted.get.mockImplementation(async (url: string) => {
      if (url === MIRROR_URL) return { data: Buffer.from(PROGUARD) };
      throw new Error("ECONNRESET");
    });

    await expect(deobfuscateCrashText(VANILLA_LOG, paths)).resolves.toContain("Minecraft.runTick");
  });

  it("refuses a file whose checksum does not match", async () => {
    await instance("vanilla");
    serve("tampered");

    await expect(deobfuscateCrashText(VANILLA_LOG, paths)).resolves.toBe(VANILLA_LOG);
    expect(await fs.pathExists(path.join(paths.cachePath, `${SHA1}.txt`))).toBe(false);
  });

  it("does not hold the crash card back past its budget", async () => {
    await instance("vanilla");
    hoisted.get.mockImplementation(() => new Promise(() => {}));

    await expect(deobfuscateCrashText(VANILLA_LOG, paths, 20)).resolves.toBe(VANILLA_LOG);
  });

  it("asks nothing for Forge, unobfuscated versions or clean logs", async () => {
    await instance("forge");
    await expect(deobfuscateCrashText(FABRIC_LOG, paths)).resolves.toBe(FABRIC_LOG);

    await instance("fabric", "26.1", null);
    await expect(deobfuscateCrashText(FABRIC_LOG, paths)).resolves.toBe(FABRIC_LOG);

    await instance("vanilla");
    const clean = "\tat java.lang.Thread.run(Thread.java:840)";
    await expect(deobfuscateCrashText(clean, paths)).resolves.toBe(clean);

    expect(hoisted.get).not.toHaveBeenCalled();
  });

  it("leaves a Fabric crash as it is when the instance has no intermediary", async () => {
    await instance("fabric");
    serve();

    await expect(deobfuscateCrashText(FABRIC_LOG, paths)).resolves.toBe(FABRIC_LOG);
  });

  it("only downloads from Mojang's hosts", async () => {
    await instance("vanilla", "1.20.1", { url: "https://example.com/client.txt", sha1: SHA1, size: 1 });

    await expect(deobfuscateCrashText(VANILLA_LOG, paths)).resolves.toBe(VANILLA_LOG);
    expect(hoisted.get).not.toHaveBeenCalled();
  });
});
