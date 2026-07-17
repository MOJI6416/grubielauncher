import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLocalImage } from "./localMedia";

function stubProtocol(protocol: string) {
  vi.stubGlobal("window", { location: { protocol } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveLocalImage", () => {
  it("routes file urls through app://media in the packaged app", () => {
    stubProtocol("app:");
    expect(
      resolveLocalImage("file:///C:/Users/Test/.grubielauncher/logo%20one.png?t=5"),
    ).toBe(
      `app://media/?p=${encodeURIComponent("C:/Users/Test/.grubielauncher/logo one.png")}&t=5`,
    );
  });

  it("keeps remote and data urls untouched", () => {
    stubProtocol("app:");
    expect(resolveLocalImage("https://cdn.grubielauncher.com/x.png")).toBe(
      "https://cdn.grubielauncher.com/x.png",
    );
    expect(resolveLocalImage("data:image/png;base64,AAA")).toBe(
      "data:image/png;base64,AAA",
    );
    expect(resolveLocalImage(null)).toBe("");
  });

  it("keeps file urls as-is outside the app protocol (dev)", () => {
    stubProtocol("http:");
    expect(resolveLocalImage("file:///C:/logo.png")).toBe(
      "file:///C:/logo.png",
    );
  });
});
