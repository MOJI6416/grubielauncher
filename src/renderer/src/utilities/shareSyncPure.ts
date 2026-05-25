import type { IArguments } from "@/types/IArguments";
import type { IVersionConf } from "@/types/IVersion";
import type { ILocalProject } from "@/types/ModManager";

export function preserveLocalBlockedPaths(
  currentMods: ILocalProject[],
  nextMods: ILocalProject[],
) {
  const localPaths = new Map<string, string>();

  for (const mod of currentMods) {
    for (const file of mod.version?.files ?? []) {
      if (!file.localPath) continue;

      localPaths.set(
        `${mod.provider}:${mod.id}:${file.filename}:${file.sha1}`,
        file.localPath,
      );
    }
  }

  for (const mod of nextMods) {
    for (const file of mod.version?.files ?? []) {
      if (file.localPath) continue;

      const localPath = localPaths.get(
        `${mod.provider}:${mod.id}:${file.filename}:${file.sha1}`,
      );
      if (localPath) file.localPath = localPath;
    }
  }
}

export function areRunArgumentsEqual(
  left: IArguments | undefined,
  right: IArguments | undefined,
) {
  return (
    (left?.game || "") === (right?.game || "") &&
    (left?.jvm || "") === (right?.jvm || "")
  );
}

export function areOtherFilesEqual(
  left: IVersionConf["loader"]["other"] | undefined,
  right: IVersionConf["loader"]["other"] | undefined,
) {
  const leftPaths = left?.paths || [];
  const rightPaths = right?.paths || [];

  return (
    (left?.size || 0) === (right?.size || 0) &&
    leftPaths.length === rightPaths.length &&
    leftPaths.every((path) => rightPaths.includes(path))
  );
}

export function normalizeShareLogoForCompare(value: string | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return raw
      .split("#")[0]
      .split("?")[0]
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
  }
}

export function areShareLogosEqual(
  left: string | undefined,
  right: string | undefined,
) {
  return (
    normalizeShareLogoForCompare(left) === normalizeShareLogoForCompare(right)
  );
}

export function getRemoteModpackIdFromUrl(fileUrl: string | undefined) {
  if (!fileUrl || fileUrl.startsWith("file://") || fileUrl.startsWith("blocked::")) {
    return null;
  }

  try {
    const url = new URL(fileUrl);
    const parts = url.pathname
      .split("/")
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      })
      .filter(Boolean);
    const modpacksIndex = parts.indexOf("modpacks");
    if (modpacksIndex === -1) return null;
    return parts[modpacksIndex + 1] || null;
  } catch {
    return null;
  }
}

export function hasLocalFilesOutsideCurrentShare(
  mods: ILocalProject[],
  shareCode: string | undefined,
) {
  if (!shareCode) return false;

  return mods.some((mod) =>
    (mod.version?.files ?? []).some((file) => {
      const remoteModpackId = getRemoteModpackIdFromUrl(file.url);
      return !!remoteModpackId && remoteModpackId !== shareCode;
    }),
  );
}

export function shouldReportStaleLocalShareFiles(
  isOwner: boolean,
  mods: ILocalProject[],
  shareCode: string | undefined,
) {
  return isOwner && hasLocalFilesOutsideCurrentShare(mods, shareCode);
}

export type ShareDiffInput = {
  isOwner: boolean;
  remoteName: string;
  currentName: string;
  remoteImage: string;
  currentLogo: string;
  modsEqual: boolean;
  serversEqual: boolean;
  remoteQuickServer?: string;
  currentQuickServer?: string;
  remoteRunArguments?: IArguments;
  currentRunArguments?: IArguments;
  remoteOptions: string;
  currentOptions: string;
  remoteOther?: IVersionConf["loader"]["other"];
  currentOther?: IVersionConf["loader"]["other"];
};

export function getShareDiffParts(input: ShareDiffInput) {
  const diff: string[] = [];

  if (input.isOwner && input.remoteName !== input.currentName) {
    diff.push("name");
  }

  if (
    input.isOwner &&
    !areShareLogosEqual(input.remoteImage, input.currentLogo)
  ) {
    diff.push("logo");
  }
  if (!input.modsEqual) diff.push("mods");
  if (
    !input.serversEqual ||
    (input.remoteQuickServer || "") !== (input.currentQuickServer || "")
  ) {
    diff.push("servers");
  }

  if (
    !areRunArgumentsEqual(input.remoteRunArguments, input.currentRunArguments)
  ) {
    diff.push("arguments");
  }

  if (input.isOwner && input.remoteOptions !== input.currentOptions) {
    diff.push("options");
  }

  if (!areOtherFilesEqual(input.remoteOther, input.currentOther)) {
    diff.push("other");
  }

  return diff;
}

export function formatShareDiffParts(diffParts: string[]) {
  return diffParts.length ? `${diffParts.join(", ")}, ` : "";
}
