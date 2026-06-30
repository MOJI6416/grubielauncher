import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "C:\\Temp") },
  session: {
    defaultSession: { clearCache: vi.fn(), clearStorageData: vi.fn() },
  },
}));

import { majorFromJavaDir, mavenToRelPath } from "./storage";

describe("mavenToRelPath", () => {
  it("resolves basic coordinates", () => {
    expect(mavenToRelPath("com.mojang:logging:1.1.1")).toBe(
      "com/mojang/logging/1.1.1/logging-1.1.1.jar",
    );
  });

  it("resolves a native classifier", () => {
    expect(mavenToRelPath("org.lwjgl:lwjgl:3.3.1:natives-windows")).toBe(
      "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-windows.jar",
    );
  });

  it("honors a custom extension", () => {
    expect(mavenToRelPath("de.oceanlabs.mcp:mcp_config:1.20.1@zip")).toBe(
      "de/oceanlabs/mcp/mcp_config/1.20.1/mcp_config-1.20.1.zip",
    );
  });

  it("returns null for malformed names", () => {
    expect(mavenToRelPath("foo:bar")).toBeNull();
  });
});

describe("majorFromJavaDir", () => {
  it("parses modern Adoptium names", () => {
    expect(majorFromJavaDir("jdk-17.0.8+7")).toBe(17);
    expect(majorFromJavaDir("jdk-21.0.1+12")).toBe(21);
  });

  it("parses Java 8 names", () => {
    expect(majorFromJavaDir("jdk8u392-b08")).toBe(8);
  });

  it("returns null for unknown layouts", () => {
    expect(majorFromJavaDir("some-random-dir")).toBeNull();
  });
});
