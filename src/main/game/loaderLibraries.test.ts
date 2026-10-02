import { describe, expect, it } from "vitest";
import { mergeLoaderLibraries } from "./loaderLibraries";

const lib = (name: string, extra: object = {}) => ({
  name,
  downloads: {
    artifact: { path: name, url: `https://x/${name}`, sha1: "", size: 0 },
  },
  ...extra,
});

describe("mergeLoaderLibraries", () => {
  it("puts loader libraries first and lets a newer loader version replace vanilla", () => {
    const merged = mergeLoaderLibraries(
      [
        lib("net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10"),
        lib("com.google.guava:guava:17.0"),
        lib("org.apache.commons:commons-lang3:3.3.2"),
      ],
      [
        lib("com.mojang:realms:1.3.5"),
        lib("com.google.guava:guava:15.0"),
        lib("org.apache.commons:commons-lang3:3.1"),
      ],
    );
    expect(merged.map((l) => l.name)).toEqual([
      "net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10",
      "com.google.guava:guava:17.0",
      "org.apache.commons:commons-lang3:3.3.2",
      "com.mojang:realms:1.3.5",
    ]);
  });

  it("keeps the vanilla entry when the loader lists the same version", () => {
    const vanilla = lib("net.sf.jopt-simple:jopt-simple:4.5");
    const merged = mergeLoaderLibraries(
      [
        lib("net.sf.jopt-simple:jopt-simple:4.5", {
          url: "https://maven.example/",
        }),
      ],
      [vanilla],
    );
    expect(merged).toEqual([vanilla]);
  });

  it("never takes over native libraries", () => {
    const natives = lib("org.lwjgl.lwjgl:lwjgl-platform:2.9.1", {
      natives: { windows: "natives-windows" },
    });
    const merged = mergeLoaderLibraries(
      [
        lib("org.lwjgl.lwjgl:lwjgl-platform:2.9.0", {
          natives: { windows: "natives-windows" },
        }),
        lib("org.lwjgl.lwjgl:lwjgl-platform:2.9.0"),
      ],
      [natives],
    );
    expect(merged).toEqual([natives]);
  });

  it("treats classifiers as separate artifacts", () => {
    const merged = mergeLoaderLibraries(
      [lib("net.minecraftforge:forge:1.12.2-14.23.5.2864:universal")],
      [lib("net.minecraftforge:forge:1.12.2-14.23.5.2864")],
    );
    expect(merged).toHaveLength(2);
  });
});
