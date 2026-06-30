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

  it("returns null for unmapped hosts, non-https and junk", () => {
    expect(toMirrorUrl("https://cdn.modrinth.com/x")).toBeNull();
    expect(toMirrorUrl("https://github.com/x")).toBeNull();
    expect(toMirrorUrl("http://libraries.minecraft.net/x")).toBeNull();
    expect(toMirrorUrl("file:///tmp/x")).toBeNull();
    expect(toMirrorUrl("not a url")).toBeNull();
  });
});

describe("resolveDownloadCandidates", () => {
  const lib = "https://libraries.minecraft.net/a.jar";
  const mirrorLib = `${MIRROR_BASE}/libraries/a.jar`;

  it("returns only the original for hosts we don't mirror", () => {
    const modrinth = "https://cdn.modrinth.com/x";
    expect(resolveDownloadCandidates(modrinth, "auto", false)).toEqual([
      modrinth,
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
});
