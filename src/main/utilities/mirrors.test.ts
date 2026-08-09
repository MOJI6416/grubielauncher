import { describe, it, expect } from "vitest";
import {
  toMirrorUrl,
  resolveDownloadCandidates,
  MIRROR_BASE,
  MIRROR_BASE_DIRECT,
  toStorageUploadUrl,
} from "./mirrors";

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

  it("maps our own storage to /storage/, the one origin a build cannot do without", () => {
    expect(
      toMirrorUrl("https://cdn.grubielauncher.com/modpacks/abc/pack.zip"),
    ).toBe(`${MIRROR_BASE}/storage/modpacks/abc/pack.zip`);
    expect(
      toMirrorUrl("https://cdn.grubielauncher.com/avatars/x.png", MIRROR_BASE_DIRECT),
    ).toBe(`${MIRROR_BASE_DIRECT}/storage/avatars/x.png`);
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

  it("maps the Adoptium release index so Java installs on a blocked network", () => {
    expect(
      toMirrorUrl("https://api.adoptium.net/v3/assets/latest/21/hotspot"),
    ).toBe(`${MIRROR_BASE}/adoptium-api/v3/assets/latest/21/hotspot`);
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
  const directLib = `${MIRROR_BASE_DIRECT}/libraries/a.jar`;

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
      directLib,
    ]);
  });

  it("auto prefers official when Mojang is reachable or unknown", () => {
    expect(resolveDownloadCandidates(lib, "auto", true)).toEqual([
      lib,
      mirrorLib,
      directLib,
    ]);
    expect(resolveDownloadCandidates(lib, "auto", null)).toEqual([
      lib,
      mirrorLib,
      directLib,
    ]);
  });

  it("auto prefers the mirror when Mojang is blocked", () => {
    expect(resolveDownloadCandidates(lib, "auto", false)).toEqual([
      mirrorLib,
      lib,
      directLib,
    ]);
  });

  it("gives Adoptium Java a mirror fallback instead of a single source", () => {
    const java =
      "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip";
    const mirrorJava =
      `${MIRROR_BASE}/temurin/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip`;
    const directJava = `${MIRROR_BASE_DIRECT}/temurin/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip`;
    expect(resolveDownloadCandidates(java, "auto", false)).toEqual([
      mirrorJava,
      java,
      directJava,
    ]);
    expect(resolveDownloadCandidates(java, "auto", true)).toEqual([
      java,
      mirrorJava,
      directJava,
    ]);
  });

  it("stops leading with a mirror that keeps failing, without giving it up", () => {
    const asset =
      "https://resources.download.minecraft.net/00/0011223344556677889900112233445566778899";
    const mirrorAsset = `${MIRROR_BASE}/assets/00/0011223344556677889900112233445566778899`;

    const directAsset = `${MIRROR_BASE_DIRECT}/assets/00/0011223344556677889900112233445566778899`;
    expect(resolveDownloadCandidates(asset, "auto", false, true)).toEqual([
      asset,
      mirrorAsset,
      directAsset,
    ]);
    expect(resolveDownloadCandidates(asset, "auto", false, false)).toEqual([
      mirrorAsset,
      asset,
      directAsset,
    ]);
    expect(resolveDownloadCandidates(asset, "mirror", null, true)[0]).toBe(
      asset,
    );
  });

  it("keeps a last-resort mirror when the origin is the thing that is unreachable", () => {
    const loaderProfile =
      "https://meta.fabricmc.net/v2/versions/loader/26.2/0.19.3/profile/json";
    const mirrorProfile = `${MIRROR_BASE}/meta-fabric/v2/versions/loader/26.2/0.19.3/profile/json`;

    for (const reachable of [true, false, null] as const) {
      expect(
        resolveDownloadCandidates(loaderProfile, "auto", reachable, true),
      ).toEqual([
        loaderProfile,
        mirrorProfile,
        `${MIRROR_BASE_DIRECT}/meta-fabric/v2/versions/loader/26.2/0.19.3/profile/json`,
      ]);
    }
  });
});

describe("toStorageUploadUrl", () => {
  const presigned =
    "https://6df3cb.r2.cloudflarestorage.com/bucket/modpacks/abc/pack%2B1.zip" +
    "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef&X-Amz-SignedHeaders=content-type%3Bhost";

  it("keeps the encoded path and the whole query, which are what is signed", () => {
    expect(toStorageUploadUrl(presigned)).toBe(
      `${MIRROR_BASE_DIRECT}/storage-upload/bucket/modpacks/abc/pack%2B1.zip` +
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef&X-Amz-SignedHeaders=content-type%3Bhost",
    );
  });

  it("refuses to route anything that is not the bucket", () => {
    expect(toStorageUploadUrl("https://evil.example.com/bucket/x?sig=1")).toBeNull();
    expect(
      toStorageUploadUrl("https://r2.cloudflarestorage.com.evil.com/x"),
    ).toBeNull();
    expect(
      toStorageUploadUrl("http://6df3cb.r2.cloudflarestorage.com/bucket/x"),
    ).toBeNull();
    expect(toStorageUploadUrl("not a url")).toBeNull();
  });
});
