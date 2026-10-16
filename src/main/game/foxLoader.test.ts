import { describe, expect, it } from "vitest";
import type { IVersionManifest } from "@/types/IVersionManifest";
import {
  applyFoxLoaderLayer,
  assertFoxLoaderBuild,
  hasFoxLoaderLayer,
} from "./foxLoader";

const BUILD = {
  id: "2.0-alpha40",
  url: "https://github.com/Fox2Code/FoxLoader/releases/download/2.0-alpha40/foxloader-2.0-alpha40.jar",
};

function library(name: string) {
  return {
    name,
    downloads: { artifact: { path: name, url: "", sha1: "", size: 0 } },
  };
}

const BETA = {
  id: "b1.7.3",
  type: "old_beta",
  mainClass: "net.minecraft.launchwrapper.Launch",
  minecraftArguments:
    "${auth_player_name} ${auth_session} --gameDir ${game_directory} --assetsDir ${game_assets}",
  javaVersion: { component: "jre-legacy", majorVersion: 8 },
  downloads: {
    client: {
      url: "https://launcher.mojang.com/v1/objects/43db9b498cb67058d2e12d394e6507722e71bb45/client.jar",
      sha1: "43db9b498cb67058d2e12d394e6507722e71bb45",
      size: 1465375,
    },
  },
  libraries: [
    library("net.minecraft:launchwrapper:1.5"),
    library("net.sf.jopt-simple:jopt-simple:4.5"),
    library("org.ow2.asm:asm-all:4.1"),
    library("net.java.jinput:jinput:2.0.5"),
    library("org.lwjgl.lwjgl:lwjgl:2.9.0"),
  ],
} as unknown as IVersionManifest;

describe("applyFoxLoaderLayer", () => {
  it("swaps launchwrapper for FoxLoader and keeps LWJGL 2 and the game arguments", () => {
    const manifest = applyFoxLoaderLayer(BETA, BUILD);

    expect(manifest.id).toBe("2.0-alpha40");
    expect(manifest.mainClass).toBe("com.fox2code.foxloader.launcher.ClientMain");
    expect(manifest.minecraftArguments).toBe(BETA.minecraftArguments);
    expect(manifest.javaVersion.majorVersion).toBe(8);
    expect(manifest.downloads.client).toEqual({ url: BUILD.url, sha1: "", size: 0 });
    expect(manifest.libraries.map((entry) => entry.name)).toEqual([
      "net.java.jinput:jinput:2.0.5",
      "org.lwjgl.lwjgl:lwjgl:2.9.0",
    ]);
  });

  it("recognises its own layer only for the same FoxLoader build", () => {
    const manifest = applyFoxLoaderLayer(BETA, BUILD);

    expect(hasFoxLoaderLayer(manifest, "2.0-alpha40")).toBe(true);
    expect(hasFoxLoaderLayer(manifest, "2.0-alpha39")).toBe(false);
    expect(hasFoxLoaderLayer(BETA, "b1.7.3")).toBe(false);
    expect(hasFoxLoaderLayer(undefined, "2.0-alpha40")).toBe(false);
  });
});

describe("assertFoxLoaderBuild", () => {
  it("accepts a FoxLoader jar of the same version", () => {
    expect(assertFoxLoaderBuild(BUILD)).toBe(BUILD);
  });

  it("refuses a foreign jar or a jar of another version", () => {
    expect(() =>
      assertFoxLoaderBuild({ id: "2.0-alpha40", url: "https://example.com/foxloader.jar" }),
    ).toThrow(/untrusted FoxLoader/);
    expect(() =>
      assertFoxLoaderBuild({ id: "2.0-alpha39", url: BUILD.url }),
    ).toThrow(/untrusted FoxLoader/);
  });
});
