import { LauncherDeepLink } from "@/types/DeepLink";
import { Provider } from "@/types/ModManager";
import { readLaunchTarget } from "@/shared/launchLink";
import { isLaunchSignatureShape } from "./launchSignature";

const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;
const SHORT_PACK_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/i;
const GROUP_CODE_PATTERN = /^[a-zA-Z0-9]{4}-?[a-zA-Z0-9]{4}$/;
const WEB_LOGIN_ID_PATTERN = /^[a-f0-9]{64}$/i;

const CATALOG_REF_PATTERN = /^[\w!@$().+,'-]{1,64}$/;
const CURSEFORGE_ID_PATTERN = /^\d{1,10}$/;

const MODRINTH_TARGETS: Record<string, "project" | "version" | "modpack"> = {
  mod: "project",
  plugin: "project",
  datapack: "project",
  resourcepack: "project",
  shader: "project",
  project: "project",
  version: "version",
  modpack: "modpack",
};

export const CATALOG_PROTOCOLS = ["modrinth", "curseforge"] as const;

function parseCatalogLink(url: URL): LauncherDeepLink | null {
  if (url.protocol === "modrinth:") {
    const target = MODRINTH_TARGETS[url.hostname.toLowerCase()];
    if (!target) return null;

    let id: string;
    try {
      id = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "");
    } catch {
      return null;
    }
    if (!CATALOG_REF_PATTERN.test(id)) return null;

    return { type: "catalog", provider: Provider.MODRINTH, target, id };
  }

  if (url.protocol === "curseforge:") {
    if (url.hostname.toLowerCase() !== "install") return null;

    const id = url.searchParams.get("addonId") ?? "";
    const fileId = url.searchParams.get("fileId") ?? "";
    if (!CURSEFORGE_ID_PATTERN.test(id)) return null;

    return {
      type: "catalog",
      provider: Provider.CURSEFORGE,
      target: "project",
      id,
      ...(CURSEFORGE_ID_PATTERN.test(fileId) ? { fileId } : {}),
    };
  }

  return null;
}

export function parseLauncherDeepLink(rawUrl: string): LauncherDeepLink | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol === "modrinth:" || url.protocol === "curseforge:") {
    return parseCatalogLink(url);
  }

  if (url.protocol !== "grubielauncher:") return null;

  if (url.hostname === "pack") {
    let shareCode: string;
    try {
      shareCode = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
    if (
      !PACK_CODE_PATTERN.test(shareCode) &&
      !SHORT_PACK_CODE_PATTERN.test(shareCode)
    ) {
      return null;
    }

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
    const target = readLaunchTarget(url.searchParams);
    const signature = url.searchParams.get("sig");

    return {
      type: "launch",
      versionName,
      instance: Number.isInteger(instance) && instance >= 0 ? instance : 0,
      ...target,
      ...("server" in target && isLaunchSignatureShape(signature)
        ? { signature }
        : {}),
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

  if (url.hostname === "theme") {
    let id: string;
    try {
      id = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
    if (!/^[a-f0-9]{24}$/.test(id)) return null;

    return {
      type: "theme",
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
