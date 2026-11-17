import { describe, expect, it } from "vitest";
import {
  COMPACT_OBJECT_HEADERS_FLAG,
  lwjglVersionOf,
  needsLwjglUnsafeAgent,
  runtimeJvmFlags,
} from "./jvmDefaults";

describe("runtimeJvmFlags", () => {
  it("turns on compact object headers from Java 25", () => {
    expect(runtimeJvmFlags({ javaMajor: 25, javaVendor: "Eclipse Adoptium" })).toEqual([
      COMPACT_OBJECT_HEADERS_FLAG,
    ]);
    expect(runtimeJvmFlags({ javaMajor: 21, javaVendor: "Eclipse Adoptium" })).toEqual(
      [],
    );
    expect(runtimeJvmFlags({ javaMajor: null, javaVendor: null })).toEqual([]);
  });

  it("skips OpenJ9 and a value the player set by hand", () => {
    expect(runtimeJvmFlags({ javaMajor: 25, javaVendor: "IBM Semeru" })).toEqual([]);
    expect(
      runtimeJvmFlags({
        javaMajor: 25,
        javaVendor: "Azul Systems",
        customJvm: ["-XX:-UseCompactObjectHeaders"],
      }),
    ).toEqual([]);
  });
});

describe("lwjgl-unsafe-agent", () => {
  const libraries = [
    { name: "com.mojang:logging:1.7.12" },
    { name: "org.lwjgl:lwjgl:3.4.1" },
    { name: "org.lwjgl:lwjgl:3.4.1:natives-windows" },
  ];

  it("finds the LWJGL version in the manifest", () => {
    expect(lwjglVersionOf(libraries)).toBe("3.4.1");
    expect(lwjglVersionOf([{ name: "org.lwjgl:lwjgl-glfw:3.4.1" }])).toBeNull();
    expect(lwjglVersionOf(undefined)).toBeNull();
  });

  it("is needed only for LWJGL 3.4.0–3.4.1 on Java 25+", () => {
    expect(needsLwjglUnsafeAgent({ javaMajor: 25, lwjglVersion: "3.4.1" })).toBe(true);
    expect(needsLwjglUnsafeAgent({ javaMajor: 25, lwjglVersion: "3.4.0" })).toBe(true);
    expect(needsLwjglUnsafeAgent({ javaMajor: 25, lwjglVersion: "3.4.3" })).toBe(false);
    expect(needsLwjglUnsafeAgent({ javaMajor: 21, lwjglVersion: "3.4.1" })).toBe(false);
    expect(needsLwjglUnsafeAgent({ javaMajor: 25, lwjglVersion: null })).toBe(false);
  });
});
