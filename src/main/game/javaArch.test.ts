import { describe, expect, it } from "vitest";
import {
  gameJavaArch,
  hasArm64MacNatives,
  machOArchs,
  managedJavaArch,
  normalizeJavaArch,
} from "./javaArch";

const appleSilicon = { os: "osx", arch: "arm64" } as const;
const intelMac = { os: "osx", arch: "x64" } as const;
const windows = { os: "windows", arch: "x64" } as const;

const libs = (...names: string[]) => names.map((name) => ({ name }));

const v1_20 = libs(
  "org.lwjgl:lwjgl:3.3.1",
  "org.lwjgl:lwjgl:3.3.1:natives-macos",
  "org.lwjgl:lwjgl:3.3.1:natives-macos-arm64",
);
const v1_18 = libs("org.lwjgl:lwjgl:3.2.2", "org.lwjgl:lwjgl-glfw:3.2.2");
const v1_12 = libs(
  "org.lwjgl.lwjgl:lwjgl:2.9.4-nightly-20150209",
  "org.lwjgl.lwjgl:lwjgl-platform:2.9.4-nightly-20150209",
);

describe("hasArm64MacNatives", () => {
  it("accepts LWJGL 3.3 and newer", () => {
    expect(hasArm64MacNatives(v1_20)).toBe(true);
    expect(hasArm64MacNatives(libs("org.lwjgl:lwjgl:3.3.3"))).toBe(true);
  });

  it("rejects LWJGL 3.2 and LWJGL 2", () => {
    expect(hasArm64MacNatives(v1_18)).toBe(false);
    expect(hasArm64MacNatives(v1_12)).toBe(false);
  });

  it("trusts an explicit arm64 natives artifact", () => {
    expect(
      hasArm64MacNatives(
        libs("org.lwjgl:lwjgl:3.2.2", "org.lwjgl:lwjgl:3.2.2:natives-macos-arm64"),
      ),
    ).toBe(true);
  });

  it("does not hold back a manifest without LWJGL", () => {
    expect(hasArm64MacNatives(libs("com.google.code.gson:gson:2.10"))).toBe(true);
  });
});

describe("gameJavaArch", () => {
  it("asks for x64 Java only on Apple Silicon without arm64 natives", () => {
    expect(gameJavaArch(appleSilicon, v1_12)).toBe("x64");
    expect(gameJavaArch(appleSilicon, v1_18)).toBe("x64");
    expect(gameJavaArch(appleSilicon, v1_20)).toBeUndefined();
  });

  it("leaves other machines on their own architecture", () => {
    expect(gameJavaArch(intelMac, v1_12)).toBeUndefined();
    expect(gameJavaArch(windows, v1_12)).toBeUndefined();
    expect(gameJavaArch(null, v1_12)).toBeUndefined();
  });
});

describe("managedJavaArch", () => {
  it("installs Java 8 as x64 on Apple Silicon, where Temurin has no arm64 build", () => {
    expect(managedJavaArch(8, undefined, appleSilicon)).toBe("x64");
    expect(managedJavaArch(17, undefined, appleSilicon)).toBeUndefined();
    expect(managedJavaArch(8, undefined, intelMac)).toBeUndefined();
    expect(managedJavaArch(8, undefined, windows)).toBeUndefined();
  });

  it("keeps an explicit request", () => {
    expect(managedJavaArch(21, "x64", appleSilicon)).toBe("x64");
  });
});

describe("normalizeJavaArch", () => {
  it("maps the names Java and release files use", () => {
    expect(normalizeJavaArch("aarch64")).toBe("arm64");
    expect(normalizeJavaArch("x86_64")).toBe("x64");
    expect(normalizeJavaArch("amd64")).toBe("x64");
    expect(normalizeJavaArch("ppc64le")).toBeNull();
    expect(normalizeJavaArch(null)).toBeNull();
  });
});

function thin(cpuType: number): Buffer {
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0);
  header.writeUInt32LE(cpuType, 4);
  return header;
}

function fat(...cpuTypes: number[]): Buffer {
  const header = Buffer.alloc(8 + cpuTypes.length * 20);
  header.writeUInt32BE(0xcafebabe, 0);
  header.writeUInt32BE(cpuTypes.length, 4);
  cpuTypes.forEach((cpuType, index) => header.writeUInt32BE(cpuType, 8 + index * 20));
  return header;
}

describe("machOArchs", () => {
  it("reads thin binaries", () => {
    expect(machOArchs(thin(0x0100000c))).toEqual(["arm64"]);
    expect(machOArchs(thin(0x01000007))).toEqual(["x64"]);
  });

  it("reads universal binaries", () => {
    expect(machOArchs(fat(0x01000007, 0x0100000c))).toEqual(["x64", "arm64"]);
  });

  it("ignores anything that is not Mach-O", () => {
    expect(machOArchs(Buffer.from("#!/bin/sh\nexec java\n"))).toEqual([]);
    expect(machOArchs(Buffer.alloc(4))).toEqual([]);
  });
});
