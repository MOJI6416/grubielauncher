import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectInstallerLibraries,
  collectProcessorArtifacts,
  isModernInstallProfile,
  isSameFile,
  linkOrCopy,
  mavenArtifactPath,
  safeLibraryPath,
  safeVersionId,
  versionLibraryPaths,
} from "./loaderInstallerSeed";

const lib = (p: string, url = `https://maven.minecraftforge.net/${p}`) => ({
  downloads: { artifact: { path: p, url, sha1: "abc", size: 3 } },
});

describe("isModernInstallProfile", () => {
  it("tells processor installers from the old versionInfo ones", () => {
    expect(isModernInstallProfile({ spec: 1, processors: [] })).toBe(true);
    expect(isModernInstallProfile({ processors: [] })).toBe(true);
    expect(
      isModernInstallProfile({ install: {}, versionInfo: { libraries: [] } }),
    ).toBe(false);
    expect(isModernInstallProfile(null)).toBe(false);
  });
});

describe("mavenArtifactPath", () => {
  it("handles classifiers and extensions used by processor data", () => {
    expect(
      mavenArtifactPath("net.minecraftforge:forge:1.20.1-47.4.23:client"),
    ).toBe(
      "net/minecraftforge/forge/1.20.1-47.4.23/forge-1.20.1-47.4.23-client.jar",
    );
    expect(
      mavenArtifactPath(
        "net.minecraft:client:1.20.1-20230612.114412:mappings@txt",
      ),
    ).toBe(
      "net/minecraft/client/1.20.1-20230612.114412/client-1.20.1-20230612.114412-mappings.txt",
    );
    expect(mavenArtifactPath("de.oceanlabs.mcp:mcp_config:1.20.1@zip")).toBe(
      "de/oceanlabs/mcp/mcp_config/1.20.1/mcp_config-1.20.1.zip",
    );
    expect(mavenArtifactPath("broken")).toBeNull();
  });
});

describe("safeLibraryPath", () => {
  it("refuses paths that leave the libraries folder", () => {
    expect(safeLibraryPath("a/b/c.jar")).toBe("a/b/c.jar");
    expect(safeLibraryPath("../evil.jar")).toBeNull();
    expect(safeLibraryPath("a/../../evil.jar")).toBeNull();
    expect(safeLibraryPath("/etc/passwd")).toBeNull();
    expect(safeLibraryPath("C:/Windows/x.dll")).toBeNull();
  });
});

describe("collectInstallerLibraries", () => {
  it("merges profile and version libraries once and skips embedded ones", () => {
    const result = collectInstallerLibraries(
      {
        libraries: [
          lib("a/a/1/a-1.jar"),
          lib("net/minecraftforge/forge/1/forge-1-universal.jar", ""),
          lib("../evil.jar"),
        ],
      },
      { libraries: [lib("a/a/1/a-1.jar"), lib("b/b/2/b-2.jar")] },
    );
    expect(result.map((item) => item.path)).toEqual([
      "a/a/1/a-1.jar",
      "b/b/2/b-2.jar",
    ]);
  });
});

describe("collectProcessorArtifacts", () => {
  it("returns client artifacts that client processors actually touch", () => {
    expect(
      collectProcessorArtifacts({
        processors: [
          {
            args: ["--input", "{MC_SRG}", "--output", "{PATCHED}"],
            outputs: {},
          },
          {
            sides: ["server"],
            args: ["--input", "{MC_UNPACKED}"],
          },
        ],
        data: {
          MC_SRG: { client: "[net.minecraft:client:1.20.1-2023:srg]" },
          PATCHED: {
            client: "[net.minecraftforge:forge:1.20.1-47.4.23:client]",
            server: "[net.minecraftforge:forge:1.20.1-47.4.23:server]",
          },
          MC_UNPACKED: {
            client: "[net.minecraft:client:1.20.1-2023:unpacked]",
          },
          PATCHED_SHA: { client: "'abc'", server: "'def'" },
          BINPATCH: {
            client: "/data/client.lzma",
            server: "/data/server.lzma",
          },
        },
      }),
    ).toEqual([
      "net/minecraft/client/1.20.1-2023/client-1.20.1-2023-srg.jar",
      "net/minecraftforge/forge/1.20.1-47.4.23/forge-1.20.1-47.4.23-client.jar",
    ]);
  });
});

describe("linkOrCopy and isSameFile", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await fs.remove(dir);
  });

  it("shares the file without copying and recognises it as the same one", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "seed-"));
    const source = path.join(dir, "libraries", "a.jar");
    const target = path.join(dir, "temp", "libraries", "a.jar");
    await fs.outputFile(source, "jar");

    await linkOrCopy(source, target);

    expect(await fs.readFile(target, "utf8")).toBe("jar");
    expect(await isSameFile(source, target)).toBe(true);
    expect(await isSameFile(source, path.join(dir, "missing"))).toBe(false);

    await fs.remove(path.join(dir, "temp"));
    expect(await fs.readFile(source, "utf8")).toBe("jar");
  });
});

describe("versionLibraryPaths and safeVersionId", () => {
  it("lists every runtime library, including ones the installer builds itself", () => {
    expect(
      versionLibraryPaths({
        libraries: [
          lib("a/a/1/a-1.jar"),
          lib("net/minecraftforge/forge/1/forge-1-client.jar", ""),
          lib("../evil.jar"),
        ],
      }),
    ).toEqual([
      "a/a/1/a-1.jar",
      "net/minecraftforge/forge/1/forge-1-client.jar",
    ]);
  });

  it("accepts loader version ids and refuses path tricks", () => {
    expect(safeVersionId("1.20.1-forge-47.4.23")).toBe("1.20.1-forge-47.4.23");
    expect(safeVersionId("neoforge-21.1.209")).toBe("neoforge-21.1.209");
    expect(safeVersionId("../x")).toBeNull();
    expect(safeVersionId("..")).toBeNull();
    expect(safeVersionId(undefined)).toBeNull();
  });
});
