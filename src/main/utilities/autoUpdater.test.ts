import { describe, expect, it, vi } from "vitest";

const updater = vi.hoisted(() => ({ checkForUpdates: () => undefined }));

vi.mock("electron-updater", () => ({
  autoUpdater: undefined,
  default: { autoUpdater: updater },
}));

describe("loadAutoUpdater", () => {
  it("finds the updater when the named export is missing from the namespace", async () => {
    const { loadAutoUpdater } = await import("./autoUpdater");
    await expect(loadAutoUpdater()).resolves.toBe(updater);
  });
});
