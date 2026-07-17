import { LauncherDeepLink } from "@/types/DeepLink";

const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;
const GROUP_CODE_PATTERN = /^[a-zA-Z0-9]{4}-?[a-zA-Z0-9]{4}$/;
const WEB_LOGIN_ID_PATTERN = /^[a-f0-9]{64}$/i;

export function parseLauncherDeepLink(rawUrl: string): LauncherDeepLink | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "grubielauncher:") return null;

  if (url.hostname === "pack") {
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

  if (url.hostname === "group") {
    let path: string;
    try {
      path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }

    const [action, code] = path.split("/");
    if (action !== "join" || !code || !GROUP_CODE_PATTERN.test(code)) {
      return null;
    }

    return {
      type: "groupJoin",
      code,
    };
  }

  if (url.hostname === "launch") {
    let versionName: string;
    try {
      versionName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
    if (!versionName) return null;

    const instanceRaw = url.searchParams.get("instance");
    const instance = instanceRaw ? Number.parseInt(instanceRaw, 10) : 0;

    return {
      type: "launch",
      versionName,
      instance: Number.isInteger(instance) && instance >= 0 ? instance : 0,
    };
  }

  if (url.hostname === "skin") {
    let id: string;
    try {
      id = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
    if (!PACK_CODE_PATTERN.test(id)) return null;

    return {
      type: "skin",
      id,
    };
  }

  if (url.hostname === "friend") {
    let userId: string;
    try {
      userId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
    if (!PACK_CODE_PATTERN.test(userId)) return null;

    return {
      type: "friend",
      userId,
    };
  }

  if (url.hostname === "login") {
    let requestId: string;
    try {
      requestId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
    if (!WEB_LOGIN_ID_PATTERN.test(requestId)) return null;

    return {
      type: "webLogin",
      requestId,
    };
  }

  return null;
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
