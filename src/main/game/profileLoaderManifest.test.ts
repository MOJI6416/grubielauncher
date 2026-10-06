import { describe, expect, it } from "vitest";
import {
  completeOrnitheProfile,
  libraryDownloadUrls,
  mavenJarPath,
  profileJvmArguments,
  replaceVanillaLibraries,
  toManifestLibrary,
} from "./profileLoaderManifest";
import { matchesOsRules } from "../utilities/other";

const vanilla = (name: string, extra: object = {}) => ({
  name,
  downloads: {
    artifact: {
      path: name,
      url: `https://libraries.minecraft.net/${name}`,
      sha1: "",
      size: 0,
    },
  },
  ...extra,
});

describe("mavenJarPath", () => {
  it("builds plain and classifier paths, keeping + in the version", () => {
    expect(mavenJarPath("org.lwjgl.lwjgl:lwjgl:2.9.4+legacyfabric.17")).toBe(
      "org/lwjgl/lwjgl/lwjgl/2.9.4+legacyfabric.17/lwjgl-2.9.4+legacyfabric.17.jar",
    );
    expect(
      mavenJarPath(
        "org.lwjgl.lwjgl:lwjgl-platform:2.9.4+legacyfabric.17",
        "natives-windows",
      ),
    ).toBe(
      "org/lwjgl/lwjgl/lwjgl-platform/2.9.4+legacyfabric.17/lwjgl-platform-2.9.4+legacyfabric.17-natives-windows.jar",
    );
    expect(mavenJarPath("broken")).toBe("");
  });
});

describe("toManifestLibrary", () => {
  it("turns a plain profile entry into an artifact download", () => {
    expect(
      toManifestLibrary({
        name: "net.fabricmc:fabric-loader:0.19.5",
        url: "https://maven.fabricmc.net/",
        sha1: "abc",
        size: 10,
      }),
    ).toEqual({
      name: "net.fabricmc:fabric-loader:0.19.5",
      downloads: {
        artifact: {
          url: "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar",
          path: "net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar",
          sha1: "abc",
          size: 10,
        },
      },
    });
  });

  it("builds native classifiers when Legacy Fabric only names them", () => {
    const library = toManifestLibrary({
      name: "org.lwjgl.lwjgl:lwjgl-platform:2.9.4+legacyfabric.17",
      url: "https://maven.legacyfabric.net/",
      natives: {
        linux: "natives-linux",
        osx: "natives-osx",
        windows: "natives-windows",
      },
    });

    expect(library.natives?.windows).toBe("natives-windows");
    expect(library.downloads.classifiers?.["natives-windows"]).toEqual({
      url: "https://repo.legacyfabric.net/legacyfabric/org/lwjgl/lwjgl/lwjgl-platform/2.9.4+legacyfabric.17/lwjgl-platform-2.9.4+legacyfabric.17-natives-windows.jar",
      path: "org/lwjgl/lwjgl/lwjgl-platform/2.9.4+legacyfabric.17/lwjgl-platform-2.9.4+legacyfabric.17-natives-windows.jar",
      sha1: "",
      size: 0,
    });
    expect(library.downloads.artifact).toBeUndefined();
  });

  it("keeps the downloads Babric already provides", () => {
    const library = toManifestLibrary({
      name: "org.lwjgl.lwjgl:lwjgl-platform:2.9.4-babric.1",
      url: "https://maven.glass-launcher.net/babric/",
      natives: { windows: "natives-windows" },
      downloads: {
        classifiers: {
          "natives-windows": {
            path: "custom/path.jar",
            url: "https://maven.glass-launcher.net/babric/custom/path.jar",
            sha1: "e4f0",
            size: 674816,
          },
        },
      },
    });

    expect(library.downloads.classifiers?.["natives-windows"]).toEqual({
      path: "custom/path.jar",
      url: "https://maven.glass-launcher.net/babric/custom/path.jar",
      sha1: "e4f0",
      size: 674816,
    });
    expect(libraryDownloadUrls(library)).toEqual([
      "https://maven.glass-launcher.net/babric/custom/path.jar",
    ]);
  });
});

describe("toManifestLibrary rules", () => {
  it("keeps the disallow rule Legacy Fabric uses to switch off vanilla asm-all", () => {
    const library = toManifestLibrary({
      name: "org.ow2.asm:asm-all:4.1",
      rules: [{ action: "disallow" }],
    });

    expect(library.rules).toEqual([{ action: "disallow" }]);
    expect(matchesOsRules(library.rules, { os: "windows", arch: "x64" })).toBe(
      false,
    );
  });

  it("adds no rules field when the profile has none", () => {
    expect(
      "rules" in toManifestLibrary({ name: "net.fabricmc:fabric-loader:0.19.5" }),
    ).toBe(false);
  });
});

describe("replaceVanillaLibraries", () => {
  it("lets the profile LWJGL replace every vanilla variant, natives included", () => {
    const merged = replaceVanillaLibraries(
      [
        vanilla("org.lwjgl.lwjgl:lwjgl:2.9.4+legacyfabric.17"),
        vanilla("org.lwjgl.lwjgl:lwjgl-platform:2.9.4+legacyfabric.17", {
          natives: { windows: "natives-windows" },
        }),
      ],
      [
        vanilla("com.google.guava:guava:17.0"),
        vanilla("org.lwjgl.lwjgl:lwjgl:2.9.4-nightly-20150209"),
        vanilla("org.lwjgl.lwjgl:lwjgl:2.9.2-nightly-20140822"),
        vanilla("org.lwjgl.lwjgl:lwjgl-platform:2.9.4-nightly-20150209", {
          natives: { windows: "natives-windows" },
        }),
        vanilla("net.java.jinput:jinput-platform:2.0.5", {
          natives: { windows: "natives-windows" },
        }),
      ],
    );

    expect(merged.map((library) => library.name)).toEqual([
      "org.lwjgl.lwjgl:lwjgl:2.9.4+legacyfabric.17",
      "org.lwjgl.lwjgl:lwjgl-platform:2.9.4+legacyfabric.17",
      "com.google.guava:guava:17.0",
      "net.java.jinput:jinput-platform:2.0.5",
    ]);
  });

  it("drops the old asm-all when the profile brings its own asm", () => {
    const merged = replaceVanillaLibraries(
      [vanilla("org.ow2.asm:asm:9.10.1")],
      [
        vanilla("net.minecraft:launchwrapper:1.5"),
        vanilla("org.ow2.asm:asm-all:4.1"),
      ],
    );

    expect(merged.map((library) => library.name)).toEqual([
      "org.ow2.asm:asm:9.10.1",
      "net.minecraft:launchwrapper:1.5",
    ]);
  });
});

describe("profileJvmArguments", () => {
  const babric = [
    "-DFabricMcEmu= net.minecraft.client.main.Main ",
    "-cp",
    "${classpath}",
    "-Djava.library.path=${natives_directory}",
  ];

  it("leaves classpath and natives to the legacy launch path", () => {
    expect(profileJvmArguments(babric, true)).toEqual([
      "-DFabricMcEmu= net.minecraft.client.main.Main ",
    ]);
  });

  it("passes everything through for modern manifests", () => {
    expect(profileJvmArguments(babric, false)).toEqual(babric);
    expect(profileJvmArguments(undefined, true)).toEqual([]);
  });
});

describe("completeOrnitheProfile", () => {
  const profile = {
    id: "fabric-loader-0.19.5-b1.7.3-ornithe-gen1",
    inheritsFrom: "b1.7.3-vanilla",
    releaseTime: "",
    time: "",
    type: "release",
    mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
    libraries: [
      { name: "net.fabricmc:sponge-mixin:0.17.4+mixin.0.8.7", url: "https://maven.fabricmc.net/" },
      {
        name: "net.ornithemc:calamus-intermediary:b1.7.3-server",
        url: "https://maven.ornithemc.net/releases/",
        sha1: "server-sha",
      },
      { name: "net.fabricmc:fabric-loader:0.19.5", url: "https://maven.fabricmc.net/" },
    ],
  };

  it("swaps a server mapping for the client one and adds the library upgrades", () => {
    const completed = completeOrnitheProfile(
      profile,
      "net.ornithemc:calamus-intermediary:b1.7.3-client",
      [
        { name: "org.apache.logging.log4j:log4j-api:2.19.0", url: "https://libraries.minecraft.net/" },
        { name: "net.fabricmc:sponge-mixin:0.16.0", url: "https://maven.fabricmc.net/" },
      ],
    );

    expect(completed.libraries).toEqual([
      profile.libraries[0],
      {
        name: "net.ornithemc:calamus-intermediary:b1.7.3-client",
        url: "https://maven.ornithemc.net/releases/",
      },
      profile.libraries[2],
      { name: "org.apache.logging.log4j:log4j-api:2.19.0", url: "https://libraries.minecraft.net/" },
    ]);
  });

  it("lets the upgrades replace vanilla libraries of the same artifact", () => {
    const completed = completeOrnitheProfile(profile, null, [
      { name: "org.apache.logging.log4j:log4j-core:2.19.0", url: "https://libraries.minecraft.net/" },
    ]);
    const merged = replaceVanillaLibraries(
      completed.libraries.map(toManifestLibrary),
      [vanilla("org.apache.logging.log4j:log4j-core:2.8.1")] as never,
    );

    expect(merged.map((library) => library.name)).toContain(
      "org.apache.logging.log4j:log4j-core:2.19.0",
    );
    expect(merged.map((library) => library.name)).not.toContain(
      "org.apache.logging.log4j:log4j-core:2.8.1",
    );
  });
});
