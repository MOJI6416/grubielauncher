import { describe, expect, it } from "vitest";
import {
  graphicsBackendArguments,
  resolveGraphicsBackend,
  supportsGraphicsBackend,
} from "./graphicsBackend";

describe("supportsGraphicsBackend", () => {
  it("starts with 26.2 and its snapshots", () => {
    expect(supportsGraphicsBackend("26.2")).toBe(true);
    expect(supportsGraphicsBackend("26.2-snapshot-3")).toBe(true);
    expect(supportsGraphicsBackend("26.3")).toBe(true);
    expect(supportsGraphicsBackend("26.4-pre1")).toBe(true);
    expect(supportsGraphicsBackend("27.1")).toBe(true);
  });

  it("leaves older versions alone", () => {
    expect(supportsGraphicsBackend("26.1.2")).toBe(false);
    expect(supportsGraphicsBackend("1.21.11")).toBe(false);
    expect(supportsGraphicsBackend("25w14a")).toBe(false);
    expect(supportsGraphicsBackend(undefined)).toBe(false);
  });
});

describe("resolveGraphicsBackend", () => {
  it("passes nothing when the game decides", () => {
    const launch = resolveGraphicsBackend({
      mcVersion: "26.3",
      choice: null,
      shaderLoader: false,
    });
    expect(launch).toBeNull();
    expect(graphicsBackendArguments(launch)).toEqual([]);
  });

  it("forces the backend the player picked", () => {
    expect(
      graphicsBackendArguments(
        resolveGraphicsBackend({
          mcVersion: "26.3",
          choice: "vulkan",
          shaderLoader: false,
        }),
      ),
    ).toEqual(["--graphicsBackend", "vulkan"]);
  });

  it("forces OpenGL whenever a shader loader is installed", () => {
    expect(
      resolveGraphicsBackend({
        mcVersion: "26.3",
        choice: "vulkan",
        shaderLoader: true,
      }),
    ).toEqual({ backend: "opengl", reason: "shaders" });
    expect(
      resolveGraphicsBackend({
        mcVersion: "26.3",
        choice: null,
        shaderLoader: true,
      }),
    ).toEqual({ backend: "opengl", reason: "shaders" });
  });

  it("never adds the argument to versions without it", () => {
    expect(
      resolveGraphicsBackend({
        mcVersion: "1.21.11",
        choice: "opengl",
        shaderLoader: true,
      }),
    ).toBeNull();
  });
});
