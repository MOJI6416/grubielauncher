const PLATFORM_NAMES: Record<string, string> = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
};

export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

const platform =
  typeof window === "undefined" ? "" : (window.api?.platform ?? "");
const isMac = platform === "darwin";

export const OS_NAME = platformName(platform);
export const MOD_KEY = isMac ? "⌘" : "Ctrl";
export const ALT_KEY = isMac ? "⌥" : "Alt";
export const SHIFT_KEY = isMac ? "⇧" : "Shift";
