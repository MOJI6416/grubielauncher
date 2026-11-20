import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import type { IVersionConf } from "@/types/IVersion";
import type { IVersionManifest } from "@/types/IVersionManifest";
import { TestZip } from "../utilities/testZip";

const hoisted = vi.hoisted(() => ({
  appData: "",
  runs: [] as string[][],
  patchExit: 0,
  requests: [] as string[],
  page: "",
  jar: null as Buffer | null,
  windows: 0,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => hoisted.appData,
    getVersion: () => "2.0.0",
    isReady: () => true,
  },
  BrowserWindow: class {
    constructor() {
      hoisted.windows += 1;
      throw new Error("window opened");
    }
  },
  session: {
    fromPartition: () => ({
      setPermissionRequestHandler: () => undefined,
      setPermissionCheckHandler: () => undefined,
      setDevicePermissionHandler: () => undefined,
    }),
  },
}));

vi.mock("axios", () => ({
  default: {
    get: async (url: string) => {
      hoisted.requests.push(url);
      if (url.includes("/adloadx")) return { data: hoisted.page };
      if (url.includes("/downloadx") && hoisted.jar) return { data: hoisted.jar };
      throw new Error("offline");
    },
  },
}));

vi.mock("../windows/mainWindow", () => ({ mainWindow: null }));

vi.mock("../utilities/game", () => ({
  runJar: async (_java: string, args: string[]) => {
    hoisted.runs.push(args);
    if (hoisted.patchExit === 0) {
      await fs.outputFile(args[args.length - 1], "patched");
    }
    return hoisted.patchExit;
  },
}));

import {
  MOJANG_LAUNCHWRAPPER,
  OPTIFINE_FILE_MISSING,
  OPTIFINE_PATCH_FAILED,
  OPTIFINE_TWEAKER,
  applyOptiFineLayer,
  downloadedOptiFineFile,
  findDirectDownloadLink,
  hasOptiFineLayer,
  importOptiFineFile,
  inspectOptiFineJar,
  isOptiFineSiteUrl,
  materializeOptiFine,
  obtainOptiFine,
  optifineLayerMatches,
  optifineStorePath,
  placedOptiFineMod,
  stripOptiFineLayer,
} from "./optifine";

const CHOICE = {
  file: "OptiFine_1.12.2_HD_U_G5.jar",
  minecraft: "1.12.2",
  edition: "HD_U_G5",
};

let root = "";
let dataRoot = "";
let versionPath = "";
let librariesPath = "";

function writeOptiFineJar(
  target: string,
  options: { version?: string; launchwrapper?: boolean; patches?: boolean } = {},
) {
  const zip = new TestZip();
  zip.addFile(
    "Config.class",
    Buffer.from(`\u0000\u0007junk${options.version ?? "OptiFine_1.12.2_HD_U_G5"}\u0000`),
  );
  zip.addFile("optifine/OptiFineTweaker.class", Buffer.from("tweaker"));
  zip.addFile("optifine/Patcher.class", Buffer.from("patcher"));
  if (options.patches !== false) {
    zip.addFile("patch/bib.class.xdelta", Buffer.from("delta"));
  }
  if (options.launchwrapper !== false) {
    zip.addFile("launchwrapper-of.txt", Buffer.from("2.2\n"));
    zip.addFile("launchwrapper-of-2.2.jar", Buffer.from("wrapper"));
  }
  fs.ensureDirSync(path.dirname(target));
  zip.writeZip(target);
}

function legacyManifest(): IVersionManifest {
  return {
    id: "1.12.2",
    mainClass: "net.minecraft.client.main.Main",
    minecraftArguments: "--username ${auth_player_name} --version ${version_name}",
    libraries: [
      {
        name: "net.sf.jopt-simple:jopt-simple:5.0.3",
        downloads: { artifact: { path: "a.jar", url: "", sha1: "", size: 0 } },
      },
    ],
  } as unknown as IVersionManifest;
}

function modernManifest(): IVersionManifest {
  return {
    id: "1.16.5",
    mainClass: "net.minecraft.client.main.Main",
    arguments: { game: ["--username", "${auth_player_name}"], jvm: [] },
    libraries: [],
  } as unknown as IVersionManifest;
}

function conf(loader: "vanilla" | "forge", optifine = true): IVersionConf {
  return {
    name: "OptiFineStand",
    version: { id: "1.12.2", url: "", type: "release", serverManager: false },
    loader: {
      name: loader,
      mods: [],
      ...(loader === "forge"
        ? { version: { id: "14.23.5.2860", url: "" } }
        : {}),
    },
    ...(optifine ? { optifine: { ...CHOICE } } : {}),
  } as unknown as IVersionConf;
}

function materialize(target: IVersionConf) {
  return materializeOptiFine({
    conf: target,
    versionPath,
    launchVersionPath: versionPath,
    librariesPath,
    javaPath: "java",
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-optifine-"));
  hoisted.appData = root;
  hoisted.runs = [];
  hoisted.patchExit = 0;
  hoisted.requests = [];
  hoisted.page = "";
  hoisted.jar = null;
  hoisted.windows = 0;
  dataRoot = path.join(root, ".grubielauncher");
  versionPath = path.join(dataRoot, "minecraft", "versions", "OptiFineStand");
  librariesPath = path.join(dataRoot, "minecraft", "libraries");
  await fs.ensureDir(versionPath);
  await fs.writeFile(path.join(versionPath, "1.12.2.jar"), "client");
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("OptiFine jar", () => {
  it("reads the version, patches and launchwrapper of an official jar", async () => {
    const jar = path.join(root, "download.jar");
    writeOptiFineJar(jar);

    expect(await inspectOptiFineJar(jar)).toEqual({
      ...CHOICE,
      patches: true,
      launchwrapper: "2.2",
    });
  });

  it("rejects archives that are not OptiFine", async () => {
    const jar = path.join(root, "other.jar");
    const zip = new TestZip();
    zip.addFile("Config.class", Buffer.from("OptiFine_1.12.2_HD_U_G5"));
    zip.writeZip(jar);

    expect(await inspectOptiFineJar(jar)).toBeNull();
    expect(await inspectOptiFineJar(path.join(root, "missing.jar"))).toBeNull();
  });

  it("stores a picked file under its official name and checks the game version", async () => {
    const picked = path.join(root, "Downloads", "OptiFine (1).jar");
    writeOptiFineJar(picked);

    expect(await importOptiFineFile(picked, "1.12.2")).toEqual(CHOICE);
    expect(await fs.pathExists(optifineStorePath(CHOICE.file))).toBe(true);
    await expect(importOptiFineFile(picked, "1.16.5")).rejects.toMatchObject({
      code: "optifineWrongVersion",
    });
  });
});

describe("official site", () => {
  it("accepts downloads only from optifine.net", () => {
    expect(
      downloadedOptiFineFile(
        "https://optifine.net/downloadx?f=OptiFine_1.12.2_HD_U_G5.jar&x=abc",
      ),
    ).toBe(CHOICE.file);
    expect(
      downloadedOptiFineFile("https://evil.example/downloadx?f=OptiFine_1.12.2_HD_U_G5.jar"),
    ).toBeNull();
    expect(downloadedOptiFineFile("https://optifine.net/downloadx?f=../x.jar")).toBeNull();
    expect(isOptiFineSiteUrl("https://optifine.net.evil.example/")).toBe(false);
    expect(isOptiFineSiteUrl("http://optifine.net/adloadx?f=a")).toBe(true);
  });
});

describe("download", () => {
  const PAGE = `<a href='downloadx?f=OptiFine_1.12.2_HD_U_G5.jar&amp;x=abc' onclick='onDownload()'>OptiFine 1.12.2 HD U G5</a>`;

  it("finds the direct link of the wanted file on the official page", () => {
    expect(findDirectDownloadLink(PAGE, CHOICE.file)).toBe(
      "https://optifine.net/downloadx?f=OptiFine_1.12.2_HD_U_G5.jar&x=abc",
    );
    expect(findDirectDownloadLink(PAGE, "OptiFine_1.16.5_HD_U_G8.jar")).toBeNull();
    expect(
      findDirectDownloadLink(
        "<a href='https://evil.example/downloadx?f=OptiFine_1.12.2_HD_U_G5.jar'>",
        CHOICE.file,
      ),
    ).toBeNull();
  });

  it("downloads from optifine.net and keeps the file for later instances", async () => {
    const source = path.join(root, "official.jar");
    writeOptiFineJar(source);
    hoisted.page = PAGE;
    hoisted.jar = await fs.readFile(source);

    expect(await obtainOptiFine(CHOICE)).toEqual(CHOICE);
    expect(hoisted.requests).toEqual([
      "https://optifine.net/adloadx?f=OptiFine_1.12.2_HD_U_G5.jar",
      "https://optifine.net/downloadx?f=OptiFine_1.12.2_HD_U_G5.jar&x=abc",
    ]);
    expect(await fs.pathExists(optifineStorePath(CHOICE.file))).toBe(true);
    expect(await fs.readdir(path.join(dataRoot, "optifine"))).toEqual([CHOICE.file]);

    hoisted.requests = [];
    expect(await obtainOptiFine(CHOICE)).toEqual(CHOICE);
    expect(hoisted.requests).toEqual([]);
  });

  it("falls back to the official page when the link cannot be found", async () => {
    hoisted.page = "<html>changed</html>";

    await expect(obtainOptiFine(CHOICE)).rejects.toThrow("window opened");
    expect(hoisted.windows).toBe(1);
  });
});

describe("vanilla layer", () => {
  it("adds the launchwrapper, the library and the tweaker to a legacy manifest", () => {
    const manifest = applyOptiFineLayer(legacyManifest(), CHOICE, "2.2");

    expect(manifest.mainClass).toBe("net.minecraft.launchwrapper.Launch");
    expect(manifest.minecraftArguments).toBe(
      `--username \${auth_player_name} --version \${version_name} --tweakClass ${OPTIFINE_TWEAKER}`,
    );
    expect(manifest.libraries.map((library) => library.name)).toEqual([
      "optifine:launchwrapper-of:2.2",
      "optifine:OptiFine:1.12.2_HD_U_G5",
      "net.sf.jopt-simple:jopt-simple:5.0.3",
    ]);
    expect(hasOptiFineLayer(manifest, CHOICE)).toBe(true);
  });

  it("uses Mojang launchwrapper when OptiFine ships none and adds game arguments", () => {
    const manifest = applyOptiFineLayer(modernManifest(), CHOICE, null);

    expect(manifest.libraries[0]).toEqual(MOJANG_LAUNCHWRAPPER);
    expect(manifest.arguments?.game.slice(-2)).toEqual([
      "--tweakClass",
      OPTIFINE_TWEAKER,
    ]);
  });

  it("does not stack the layer twice", () => {
    const once = applyOptiFineLayer(legacyManifest(), CHOICE, "2.2");
    const twice = applyOptiFineLayer(once, CHOICE, "2.2");

    expect(twice.libraries).toHaveLength(3);
    expect(twice.minecraftArguments?.match(/--tweakClass/g)).toHaveLength(1);
  });

  it("takes the layer off without the network and restores the vanilla launch", () => {
    for (const make of [legacyManifest, modernManifest]) {
      for (const wrapper of ["2.2", null]) {
        const layered = applyOptiFineLayer(make(), CHOICE, wrapper);
        expect(stripOptiFineLayer(layered)).toEqual(make());
      }
    }
    expect(stripOptiFineLayer(legacyManifest())).toEqual(legacyManifest());
  });

  it("notices when the wanted OptiFine and the manifest disagree", () => {
    const plain = legacyManifest();
    const layered = applyOptiFineLayer(legacyManifest(), CHOICE, "2.2");

    expect(optifineLayerMatches(plain, conf("vanilla"))).toBe(false);
    expect(optifineLayerMatches(layered, conf("vanilla"))).toBe(true);
    expect(optifineLayerMatches(layered, conf("vanilla", false))).toBe(false);
    expect(optifineLayerMatches(plain, conf("vanilla", false))).toBe(true);
    expect(optifineLayerMatches(plain, conf("forge"))).toBe(true);
  });
});

describe("materialize", () => {
  it("patches the client jar with the official Patcher and extracts launchwrapper", async () => {
    writeOptiFineJar(optifineStorePath(CHOICE.file, dataRoot));

    await materialize(conf("vanilla"));

    const library = path.join(
      librariesPath,
      "optifine/OptiFine/1.12.2_HD_U_G5/OptiFine-1.12.2_HD_U_G5.jar",
    );
    expect(await fs.readFile(library, "utf8")).toBe("patched");
    expect(hoisted.runs).toHaveLength(1);
    expect(hoisted.runs[0].slice(2, 5)).toEqual([
      "optifine.Patcher",
      path.join(versionPath, "1.12.2.jar"),
      optifineStorePath(CHOICE.file, dataRoot),
    ]);
    expect(
      await fs.readFile(
        path.join(librariesPath, "optifine/launchwrapper-of/2.2/launchwrapper-of-2.2.jar"),
        "utf8",
      ),
    ).toBe("wrapper");

    await materialize(conf("vanilla"));
    expect(hoisted.runs).toHaveLength(1);
  });

  it("keeps working without the stored file once everything is in place", async () => {
    writeOptiFineJar(optifineStorePath(CHOICE.file, dataRoot));
    await materialize(conf("vanilla"));
    await fs.remove(path.join(dataRoot, "optifine"));

    const manifest = applyOptiFineLayer(legacyManifest(), CHOICE, "2.2");
    await materializeOptiFine({
      conf: conf("vanilla"),
      versionPath,
      launchVersionPath: versionPath,
      librariesPath,
      javaPath: "java",
      manifest,
    });
    expect(hoisted.runs).toHaveLength(1);

    await fs.remove(
      path.join(librariesPath, "optifine/launchwrapper-of/2.2/launchwrapper-of-2.2.jar"),
    );
    await expect(
      materializeOptiFine({
        conf: conf("vanilla"),
        versionPath,
        launchVersionPath: versionPath,
        librariesPath,
        javaPath: "java",
        manifest,
      }),
    ).rejects.toMatchObject({ code: OPTIFINE_FILE_MISSING });
  });

  it("fails clearly when the patcher fails or the file is gone", async () => {
    await expect(materialize(conf("vanilla"))).rejects.toMatchObject({
      code: OPTIFINE_FILE_MISSING,
    });

    writeOptiFineJar(optifineStorePath(CHOICE.file, dataRoot));
    hoisted.patchExit = 1;
    await expect(materialize(conf("vanilla"))).rejects.toMatchObject({
      code: OPTIFINE_PATCH_FAILED,
    });
  });

  it("puts OptiFine into the Forge mods folder and takes back only its own file", async () => {
    writeOptiFineJar(optifineStorePath(CHOICE.file, dataRoot));
    const mods = path.join(versionPath, "mods");
    await fs.outputFile(path.join(mods, "OptiFine_1.12.2_HD_U_F5.jar"), "player's own");

    await materialize(conf("forge"));

    expect(await fs.pathExists(path.join(mods, CHOICE.file))).toBe(true);
    expect(await placedOptiFineMod(versionPath)).toBe(CHOICE.file);
    expect(hoisted.runs).toHaveLength(0);

    await materialize(conf("forge", false));

    expect(await fs.pathExists(path.join(mods, CHOICE.file))).toBe(false);
    expect(await fs.pathExists(path.join(mods, "OptiFine_1.12.2_HD_U_F5.jar"))).toBe(true);
    expect(await placedOptiFineMod(versionPath)).toBeNull();
  });

  it("ignores OptiFine on versions it does not support", async () => {
    const newer = conf("vanilla");
    newer.version.id = "1.20.1";

    await materialize(newer);
    expect(hoisted.runs).toHaveLength(0);
  });
});
