import { describe, expect, it } from "vitest";
import type { JavaRuntimeList } from "@/shared/javaRuntime";
import {
  decodeJavaOverride,
  effectiveJava,
  encodeJavaOverride,
  installedRuntimes,
  instanceRequiredJava,
  javaLabel,
  javaMajors,
  minecraftRangeKey,
} from "./javaChoices";

const list: JavaRuntimeList = {
  runtimes: [
    {
      home: "C:/launcher/java/jdk-21",
      source: "managed",
      major: 21,
      version: "21.0.5",
      vendor: "Temurin",
      arch: "x86_64",
    },
    {
      home: "C:/Program Files/Zulu/zulu-17",
      source: "system",
      major: 17,
      version: "17.0.12",
      vendor: "Zulu",
      arch: "amd64",
    },
    {
      home: "D:/jdks/graal-21",
      source: "custom",
      major: 21,
      version: "21.0.2",
      vendor: "GraalVM",
      arch: "amd64",
    },
    {
      home: "D:/jdks/old",
      source: "custom",
      major: 11,
      version: null,
      vendor: null,
      arch: null,
      missing: true,
    },
  ],
  defaults: { "17": "C:/Program Files/Zulu/zulu-17" },
  scannedAt: 1,
};

describe("java choice encoding", () => {
  it("round-trips both kinds of choice", () => {
    for (const choice of [{ major: 17 }, { home: "D:/jdks/graal-21" }]) {
      expect(decodeJavaOverride(encodeJavaOverride(choice))).toEqual(choice);
    }
    expect(decodeJavaOverride("major:abc")).toBeUndefined();
    expect(decodeJavaOverride("home:relative")).toBeUndefined();
    expect(decodeJavaOverride("auto")).toBeUndefined();
  });
});

describe("effectiveJava", () => {
  it("shows the launcher's Java when nothing is chosen", () => {
    expect(effectiveJava(undefined, 21, list)).toMatchObject({
      major: 21,
      vendor: "Temurin",
      installed: true,
      missing: false,
    });
  });

  it("uses the global choice for a pinned major", () => {
    expect(effectiveJava({ major: 17 }, 21, list)).toMatchObject({
      major: 17,
      vendor: "Zulu",
      installed: true,
    });
  });

  it("says when the launcher still has to download it", () => {
    expect(effectiveJava({ major: 8 }, 8, list)).toMatchObject({
      major: 8,
      installed: false,
    });
  });

  it("marks a picked Java that is gone", () => {
    expect(effectiveJava({ home: "D:/jdks/old" }, 21, list).missing).toBe(true);
    expect(effectiveJava({ home: "E:/nowhere" }, 21, list)).toMatchObject({
      major: null,
      missing: true,
    });
  });
});

describe("lists", () => {
  it("offers installed runtimes that still exist", () => {
    expect(installedRuntimes(list).map((runtime) => runtime.vendor)).toEqual([
      "Zulu",
      "GraalVM",
    ]);
  });

  it("covers the Minecraft majors plus the ones in use", () => {
    expect(javaMajors(list, [16, undefined])).toEqual([8, 16, 17, 21, 25]);
  });

  it("labels and ranges", () => {
    expect(javaLabel({ major: 21, vendor: "Zulu" })).toBe("21 · Zulu");
    expect(javaLabel({ major: null, vendor: null })).toBe("—");
    expect(minecraftRangeKey(8)).toBe("legacy");
    expect(minecraftRangeKey(16)).toBe("mc117");
    expect(minecraftRangeKey(17)).toBe("mc118");
    expect(minecraftRangeKey(21)).toBe("mc1205");
    expect(minecraftRangeKey(25)).toBe("calendar");
  });
});

describe("instanceRequiredJava", () => {
  const conf = (id: string, loader = "fabric") => ({
    version: { id },
    loader: { name: loader, version: null },
  });

  it("prefers what the launcher resolved, then the manifest, then the version", () => {
    expect(
      instanceRequiredJava({ java: { requiredMajor: 16 }, version: conf("1.17.1") }),
    ).toBe(16);
    expect(instanceRequiredJava({ javaMajorVersion: 17, version: conf("1.18.2") })).toBe(17);
    expect(instanceRequiredJava({ version: conf("1.12.2", "forge") })).toBe(8);
    expect(instanceRequiredJava({ version: conf("b1.7.3", "babric") })).toBe(17);
  });
});
