import { afterEach, describe, expect, it, vi } from "vitest";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";

const versionConf = {
  name: "Test Version",
  version: { id: "1.21.1" },
  loader: { name: "vanilla", mods: [] },
} as any;

const account = { nickname: "player", type: "plain" } as any;
const settings = { downloadLimit: 6 } as any;

const installedState = {
  hasManifest: true,
  javaMajorVersion: 21,
  launcherPath: "/launcher",
  minecraftPath: "/launcher/minecraft",
  versionPath: "/launcher/minecraft/versions/Test Version",
  javaPath: "/launcher/java/21/bin/java",
  isQuickPlayMultiplayer: true,
  isQuickPlaySingleplayer: true,
};

const emptyState = {
  hasManifest: false,
  javaMajorVersion: undefined,
  launcherPath: "/launcher",
  minecraftPath: "/launcher/minecraft",
  versionPath: "/launcher/minecraft/versions/Test Version",
  javaPath: "",
  isQuickPlayMultiplayer: false,
  isQuickPlaySingleplayer: false,
};

function makeApi(install: any, init = vi.fn().mockResolvedValue(installedState)) {
  return { version: { install, init } };
}

async function loadVersionClass(api: any) {
  vi.resetModules();
  vi.stubGlobal("window", { api });
  return await import("./Version");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("renderer Version wrapper", () => {
  it("does not throw for successful install results", async () => {
    const api = makeApi(vi.fn().mockResolvedValue({ success: true }));
    const { Version } = await loadVersionClass(api);

    await expect(
      new Version(versionConf).install(account, settings),
    ).resolves.toBeUndefined();
  });

  it("throws VERSION_INSTALL_CANCELLED for cancelled install results", async () => {
    const api = makeApi(
      vi.fn().mockResolvedValue({
        success: false,
        cancelled: true,
        error: VERSION_INSTALL_CANCELLED,
      }),
    );
    const { Version } = await loadVersionClass(api);

    await expect(
      new Version(versionConf).install(account, settings),
    ).rejects.toThrow(VERSION_INSTALL_CANCELLED);
  });

  it("throws readable errors for failed install results", async () => {
    const api = makeApi(
      vi.fn().mockResolvedValue({
        success: false,
        error: "Manifest failed",
      }),
    );
    const { Version } = await loadVersionClass(api);

    await expect(
      new Version(versionConf).install(account, settings),
    ).rejects.toThrow("Manifest failed");
  });

  it("forwards install items and options without losing them", async () => {
    const api = makeApi(vi.fn().mockResolvedValue({ success: true }));
    const { Version } = await loadVersionClass(api);
    const items = [
      {
        url: "https://example/file.jar",
        destination: "file.jar",
        group: "mods",
      },
    ];
    const options = {
      operation: "integrity",
      cleanupOnCancel: true,
      keepProgressOpen: true,
    } as const;

    await new Version(versionConf).install(account, settings, items, options);

    expect(api.version.install).toHaveBeenCalledWith(
      account,
      settings,
      versionConf,
      items,
      options,
    );
  });

  it("re-reads the manifest after a successful install", async () => {
    const init = vi
      .fn()
      .mockResolvedValueOnce(emptyState)
      .mockResolvedValueOnce(installedState);
    const api = makeApi(vi.fn().mockResolvedValue({ success: true }), init);
    const { Version } = await loadVersionClass(api);

    const instance = new Version(versionConf);
    await instance.init();

    expect(instance.isQuickPlayMultiplayer).toBe(false);
    expect(instance.javaMajorVersion).toBeUndefined();

    await instance.install(account, settings);

    expect(init).toHaveBeenCalledTimes(2);
    expect(instance.hasManifest).toBe(true);
    expect(instance.isQuickPlayMultiplayer).toBe(true);
    expect(instance.javaMajorVersion).toBe(21);
  });

  it("re-reads the manifest after a legacy boolean install result", async () => {
    const init = vi
      .fn()
      .mockResolvedValueOnce(emptyState)
      .mockResolvedValueOnce(installedState);
    const api = makeApi(vi.fn().mockResolvedValue(true), init);
    const { Version } = await loadVersionClass(api);

    const instance = new Version(versionConf);
    await instance.init();
    await instance.install(account, settings);

    expect(init).toHaveBeenCalledTimes(2);
    expect(instance.isQuickPlayMultiplayer).toBe(true);
  });
});
