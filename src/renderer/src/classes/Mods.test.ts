import { afterEach, describe, expect, it, vi } from "vitest";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";

const versionConf = {
  name: "Test Version",
  loader: {
    name: "vanilla",
    mods: [],
    other: { url: "https://example/other.zip" },
  },
} as any;

const settings = { downloadLimit: 6 } as any;
const server = { name: "Local Server" } as any;

async function loadModsClass(api: any) {
  vi.resetModules();
  vi.stubGlobal("window", { api });
  return await import("./Mods");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("renderer Mods wrapper", () => {
  it("forwards check options to the API", async () => {
    const api = {
      mods: {
        check: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    const { Mods } = await loadModsClass(api);
    const options = {
      operation: "install",
      keepProgressOpen: true,
    } as const;

    await new Mods(settings, versionConf, server).check(options);

    expect(api.mods.check).toHaveBeenCalledWith(
      settings,
      versionConf,
      server,
      options,
    );
  });

  it("forwards downloadOther options to the API", async () => {
    const api = {
      mods: {
        downloadOther: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    const { Mods } = await loadModsClass(api);
    const options = {
      operation: "install",
      keepProgressOpen: false,
    } as const;

    await new Mods(settings, versionConf).downloadOther(options);

    expect(api.mods.downloadOther).toHaveBeenCalledWith(
      settings,
      versionConf,
      options,
    );
  });

  it("throws VERSION_INSTALL_CANCELLED for cancelled check results", async () => {
    const api = {
      mods: {
        check: vi.fn().mockResolvedValue({
          success: false,
          cancelled: true,
          error: VERSION_INSTALL_CANCELLED,
        }),
      },
    };
    const { Mods } = await loadModsClass(api);

    await expect(new Mods(settings, versionConf).check()).rejects.toThrow(
      VERSION_INSTALL_CANCELLED,
    );
  });
});
