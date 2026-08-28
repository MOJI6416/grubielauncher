import { describe, expect, it } from "vitest";
import {
  clampServerMemory,
  recommendedServerMemory,
  serverMemoryLimit,
} from "./serverMemory";

describe("recommendedServerMemory", () => {
  it("grows with the amount of content", () => {
    expect(recommendedServerMemory(0)).toBe(2048);
    expect(recommendedServerMemory(12)).toBe(3072);
    expect(recommendedServerMemory(90)).toBe(4096);
    expect(recommendedServerMemory(300)).toBe(6144);
  });
});

describe("serverMemoryLimit", () => {
  it("leaves memory for the system", () => {
    expect(serverMemoryLimit(16384)).toBe(14336);
  });

  it("never drops below a usable ceiling", () => {
    expect(serverMemoryLimit(4096)).toBe(4096);
    expect(serverMemoryLimit(0)).toBe(16384);
  });
});

describe("clampServerMemory", () => {
  it("keeps the value inside the slider range", () => {
    expect(clampServerMemory(512, 8192)).toBe(1024);
    expect(clampServerMemory(99999, 8192)).toBe(8192);
  });

  it("snaps to the slider step", () => {
    expect(clampServerMemory(3000, 8192)).toBe(3072);
  });

  it("survives a machine with almost no memory", () => {
    expect(clampServerMemory(4096, 512)).toBe(1024);
  });
});
