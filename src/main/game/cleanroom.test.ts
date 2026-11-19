import os from "os";
import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { TestZip } from "../utilities/testZip";
import { cleanroomInstallerUrl } from "@/shared/cleanroom";
import {
  assertCleanroomBuild,
  hasCleanroomLayer,
  nativeFileName,
  parseCleanroomManifest,
  readCleanroomInstaller,
} from "./cleanroom";

const VERSION = "0.7.14-alpha";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

function manifest(universalSha1: string) {
  return {
    id: `Cleanroom-${VERSION}`,
    mainClass: "top.outlands.foundation.boot.Foundation",
    assetIndex: { id: "1.12", url: "https://piston-meta.mojang.com/1.12.json" },
    downloads: { client: { url: "https://piston-data.mojang.com/client.jar", sha1: "c", size: 1 } },
    javaVersion: { component: "java-runtime-epsilon", majorVersion: 25 },
    minecraftArguments: "--tweakClass net.minecraftforge.fml.common.launcher.FMLTweaker",
    libraries: [
      {
        name: `com.cleanroommc:cleanroom:${VERSION}:universal`,
        downloads: {
          artifact: {
            path: `com/cleanroommc/cleanroom/${VERSION}/cleanroom-${VERSION}-universal.jar`,
            url: "",
            sha1: universalSha1,
            size: 9,
          },
        },
      },
    ],
  };
}

async function writeInstaller(root: string, universal: Buffer, sha1: string) {
  const zip = new TestZip();
  zip.addFile("version.json", Buffer.from(JSON.stringify(manifest(sha1))));
  zip.addFile(
    `maven/com/cleanroommc/cleanroom/${VERSION}/cleanroom-${VERSION}-universal.jar`,
    universal,
  );
  const installer = path.join(root, "installer.jar");
  zip.writeZip(installer);
  return installer;
}

describe("readCleanroomInstaller", () => {
  it("takes the version.json and places the universal jar into libraries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-cleanroom-"));
    roots.push(root);
    const universal = Buffer.from("universal");
    const sha1 = createHash("sha1").update(universal).digest("hex");
    const installer = await writeInstaller(root, universal, sha1);
    const libraries = path.join(root, "libraries");

    const result = await readCleanroomInstaller(installer, VERSION, libraries);

    expect(result.id).toBe(`Cleanroom-${VERSION}`);
    expect(result.javaVersion?.majorVersion).toBe(25);
    expect(
      await fs.readFile(
        path.join(libraries, "com/cleanroommc/cleanroom", VERSION, `cleanroom-${VERSION}-universal.jar`),
      ),
    ).toEqual(universal);
  });

  it("refuses a universal jar that fails its checksum", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-cleanroom-"));
    roots.push(root);
    const installer = await writeInstaller(root, Buffer.from("universal"), "0".repeat(40));

    await expect(
      readCleanroomInstaller(installer, VERSION, path.join(root, "libraries")),
    ).rejects.toThrow("checksum");
  });
});

describe("parseCleanroomManifest", () => {
  it("refuses a version.json of another version", () => {
    expect(() => parseCleanroomManifest(manifest("a"), "0.7.13-alpha")).toThrow();
    expect(() => parseCleanroomManifest({ id: "x" }, VERSION)).toThrow();
  });
});

describe("assertCleanroomBuild", () => {
  it("accepts only the official installer of that version", () => {
    const build = { id: VERSION, url: cleanroomInstallerUrl(VERSION) };
    expect(assertCleanroomBuild(build)).toBe(build);
    expect(() =>
      assertCleanroomBuild({ id: VERSION, url: "https://example.org/cleanroom.jar" }),
    ).toThrow();
  });
});

describe("hasCleanroomLayer", () => {
  it("matches the manifest of the chosen Cleanroom version", () => {
    expect(hasCleanroomLayer({ id: `Cleanroom-${VERSION}` } as any, VERSION)).toBe(true);
    expect(hasCleanroomLayer({ id: "1.12.2" } as any, VERSION)).toBe(false);
  });
});

describe("nativeFileName", () => {
  it("falls back to the url when a classifier has no path", () => {
    expect(
      nativeFileName({
        url: "https://repo.maven.apache.org/maven2/org/lwjgl/lwjgl/3.4.3/lwjgl-3.4.3-natives-windows.jar",
      }),
    ).toBe("lwjgl-3.4.3-natives-windows.jar");
    expect(nativeFileName({ path: "org/lwjgl/a-natives.jar", url: "https://x/b.jar" })).toBe(
      "a-natives.jar",
    );
    expect(nativeFileName({})).toBeNull();
  });
});
