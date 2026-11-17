export const GPU_PREFERENCES = ["auto", "discrete", "integrated"] as const;

export type GpuPreference = (typeof GPU_PREFERENCES)[number];

export const DEFAULT_GPU_PREFERENCE: GpuPreference = "auto";

export const WINDOWS_GPU_PREFERENCES_KEY =
  "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences";

export function normalizeGpuPreference(value: unknown): GpuPreference {
  return GPU_PREFERENCES.includes(value as GpuPreference)
    ? (value as GpuPreference)
    : DEFAULT_GPU_PREFERENCE;
}

export function supportsGpuPreference(platform: string): boolean {
  return platform === "win32" || platform === "linux";
}

export function windowsGpuPreferenceCode(
  preference: GpuPreference,
): 1 | 2 | null {
  if (preference === "discrete") return 2;
  if (preference === "integrated") return 1;
  return null;
}

export function mergeWindowsGpuValue(
  previous: string | null,
  code: 1 | 2,
): string {
  const entries = (previous ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !/^GpuPreference=/i.test(part));
  return [...entries, `GpuPreference=${code}`]
    .map((part) => `${part};`)
    .join("");
}

export function linuxGpuEnvironment(
  preference: GpuPreference,
  driver: { nvidia: boolean },
): Record<string, string> {
  if (preference === "discrete") {
    return driver.nvidia
      ? {
          __NV_PRIME_RENDER_OFFLOAD: "1",
          __VK_LAYER_NV_optimus: "NVIDIA_only",
          __GLX_VENDOR_LIBRARY_NAME: "nvidia",
        }
      : { DRI_PRIME: "1" };
  }

  if (preference === "integrated") {
    return driver.nvidia ? {} : { DRI_PRIME: "0" };
  }

  return {};
}

export function parseRegQueryValue(
  stdout: string,
  name: string,
): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const marker = line.indexOf(" REG_SZ ");
    if (marker === -1) continue;
    if (line.slice(0, marker).trim().toLowerCase() !== name.toLowerCase()) {
      continue;
    }
    return line.slice(marker + " REG_SZ ".length).trim();
  }
  return null;
}
