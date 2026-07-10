import { describe, it, expect } from "vitest";
import { toMirrorUrl, resolveDownloadCandidates, MIRROR_BASE } from "./mirrors";

describe("toMirrorUrl", () => {
  it("maps known Mojang/loader hosts to mirror prefixes", () => {
    expect(toMirrorUrl("https://libraries.minecraft.net/a/b.jar")).toBe(
      `${MIRROR_BASE}/libraries/a/b.jar`,
    );
    expect(
      toMirrorUrl("https://piston-data.mojang.com/v1/objects/abc/client.jar"),
    ).toBe(`${MIRROR_BASE}/piston-data/v1/objects/abc/client.jar`);
    expect(toMirrorUrl("https://maven.neoforged.net/releases/x.jar")).toBe(
      `${MIRROR_BASE}/maven-neoforge/releases/x.jar`,
    );
    expect(
      toMirrorUrl("https://resources.download.minecraft.net/ab/abcdef"),
    ).toBe(`${MIRROR_BASE}/assets/ab/abcdef`);
  });

  it("preserves the query string", () => {
    expect(
      toMirrorUrl("https://meta.fabricmc.net/v2/versions/loader/1.20?x=1"),
    ).toBe(`${MIRROR_BASE}/meta-fabric/v2/versions/loader/1.20?x=1`);
  });

  it("maps the Modrinth CDN to the /modrinth/ prefix", () => {
    expect(
      toMirrorUrl(
        "https://cdn.modrinth.com/data/AANobbMI/versions/vf7UgZpC/sodium.jar",
      ),
    ).toBe(`${MIRROR_BASE}/modrinth/data/AANobbMI/versions/vf7UgZpC/sodium.jar`);
  });

  it("maps both CurseForge file hosts to one /forgecdn/ prefix (mediafilez)", () => {
    const path = "/files/3040/523/jei_1.12.2-4.16.1.301.jar";
    expect(toMirrorUrl(`https://edge.forgecdn.net${path}`)).toBe(
      `${MIRROR_BASE}/forgecdn${path}`,
    );
    expect(toMirrorUrl(`https://mediafilez.forgecdn.net${path}`)).toBe(
      `${MIRROR_BASE}/forgecdn${path}`,
    );
  });

  it("maps Adoptium Temurin GitHub release assets to the /temurin/ prefix", () => {
    const asset =
      "/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip";
    expect(toMirrorUrl(`https://github.com${asset}`)).toBe(
      `${MIRROR_BASE}/temurin${asset}`,
    );
  });

  it("only mirrors Adoptium release-download paths on github.com", () => {
    expect(toMirrorUrl("https://github.com/x")).toBeNull();
    expect(
      toMirrorUrl("https://github.com/adoptium/temurin21-binaries"),
    ).toBeNull();
    expect(
      toMirrorUrl("https://github.com/someone/mod/releases/download/v1/mod.jar"),
    ).toBeNull();
  });

  it("returns null for unmapped hosts, non-https and junk", () => {
    expect(toMirrorUrl("https://cdn.curseforge.com/x")).toBeNull();
    expect(toMirrorUrl("http://libraries.minecraft.net/x")).toBeNull();
    expect(toMirrorUrl("file:///tmp/x")).toBeNull();
    expect(toMirrorUrl("not a url")).toBeNull();
  });
});

describe("resolveDownloadCandidates", () => {
  const lib = "https://libraries.minecraft.net/a.jar";
  const mirrorLib = `${MIRROR_BASE}/libraries/a.jar`;

  it("returns only the original for hosts we don't mirror", () => {
    const curseforge = "https://cdn.curseforge.com/x";
    expect(resolveDownloadCandidates(curseforge, "auto", false)).toEqual([
      curseforge,
    ]);
  });

  it("official never touches the mirror", () => {
    expect(resolveDownloadCandidates(lib, "official", false)).toEqual([lib]);
  });

  it("mirror tries the mirror first, official as fallback", () => {
    expect(resolveDownloadCandidates(lib, "mirror", true)).toEqual([
      mirrorLib,
      lib,
    ]);
  });

  it("auto prefers official when Mojang is reachable or unknown", () => {
    expect(resolveDownloadCandidates(lib, "auto", true)).toEqual([
      lib,
      mirrorLib,
    ]);
    expect(resolveDownloadCandidates(lib, "auto", null)).toEqual([
      lib,
      mirrorLib,
    ]);
  });

  it("auto prefers the mirror when Mojang is blocked", () => {
    expect(resolveDownloadCandidates(lib, "auto", false)).toEqual([
      mirrorLib,
      lib,
    ]);
  });

  it("gives Adoptium Java a mirror fallback instead of a single source", () => {
    const java =
      "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip";
    const mirrorJava =
      `${MIRROR_BASE}/temurin/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip`;
    expect(resolveDownloadCandidates(java, "auto", false)).toEqual([
      mirrorJava,
      java,
    ]);
    expect(resolveDownloadCandidates(java, "auto", true)).toEqual([
      java,
      mirrorJava,
    ]);
  });
});
