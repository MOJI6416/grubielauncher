import { describe, expect, it } from "vitest";
import {
  linuxGpuEnvironment,
  mergeWindowsGpuValue,
  normalizeGpuPreference,
  parseRegQueryValue,
  windowsGpuPreferenceCode,
} from "./gpuPreference";

describe("windows GPU preference", () => {
  it("maps the choice to the DirectX preference code", () => {
    expect(windowsGpuPreferenceCode("discrete")).toBe(2);
    expect(windowsGpuPreferenceCode("integrated")).toBe(1);
    expect(windowsGpuPreferenceCode("auto")).toBeNull();
  });

  it("keeps the other per-app settings Windows stores in the same value", () => {
    expect(mergeWindowsGpuValue(null, 2)).toBe("GpuPreference=2;");
    expect(mergeWindowsGpuValue("AutoHDREnable=2097;", 2)).toBe(
      "AutoHDREnable=2097;GpuPreference=2;",
    );
    expect(
      mergeWindowsGpuValue("AutoHDREnable=2097;GpuPreference=1;AppStatus=1;", 2),
    ).toBe("AutoHDREnable=2097;AppStatus=1;GpuPreference=2;");
  });

  it("reads a value back from reg query output", () => {
    const stdout = [
      "",
      "HKEY_CURRENT_USER\\Software\\Microsoft\\DirectX\\UserGpuPreferences",
      "    C:\\Program Files\\Steam\\game.exe    REG_SZ    AutoHDREnable=2097;GpuPreference=2;",
      "    C:\\Users\\Steve\\java\\bin\\java.exe    REG_SZ    GpuPreference=1;",
      "",
    ].join("\r\n");

    expect(
      parseRegQueryValue(stdout, "C:\\Users\\Steve\\java\\bin\\java.exe"),
    ).toBe("GpuPreference=1;");
    expect(parseRegQueryValue(stdout, "C:\\missing.exe")).toBeNull();
  });

  it("falls back to auto for unknown values", () => {
    expect(normalizeGpuPreference("discrete")).toBe("discrete");
    expect(normalizeGpuPreference("turbo")).toBe("auto");
  });
});

describe("linux GPU environment", () => {
  it("uses PRIME render offload on the NVIDIA driver", () => {
    expect(linuxGpuEnvironment("discrete", { nvidia: true })).toEqual({
      __NV_PRIME_RENDER_OFFLOAD: "1",
      __VK_LAYER_NV_optimus: "NVIDIA_only",
      __GLX_VENDOR_LIBRARY_NAME: "nvidia",
    });
  });

  it("uses DRI_PRIME with Mesa drivers", () => {
    expect(linuxGpuEnvironment("discrete", { nvidia: false })).toEqual({
      DRI_PRIME: "1",
    });
    expect(linuxGpuEnvironment("integrated", { nvidia: false })).toEqual({
      DRI_PRIME: "0",
    });
  });

  it("adds nothing for auto", () => {
    expect(linuxGpuEnvironment("auto", { nvidia: true })).toEqual({});
    expect(linuxGpuEnvironment("integrated", { nvidia: true })).toEqual({});
  });
});
