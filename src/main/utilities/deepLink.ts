import { LauncherDeepLink } from "@/types/DeepLink";

const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;

export function parseLauncherDeepLink(rawUrl: string): LauncherDeepLink | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "grubielauncher:") return null;
  if (url.hostname !== "pack") return null;

  let shareCode: string;
  try {
    shareCode = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  if (!PACK_CODE_PATTERN.test(shareCode)) return null;

  return {
    type: "pack",
    shareCode,
  };
}

export function extractLauncherDeepLink(
  argv: readonly string[],
): LauncherDeepLink | null {
  for (const arg of argv) {
    const parsed = parseLauncherDeepLink(arg);
    if (parsed) return parsed;
  }

  return null;
}
