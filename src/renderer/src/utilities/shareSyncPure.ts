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

  if (input.remoteImage !== input.currentLogo) diff.push("logo");
  if (!input.modsEqual) diff.push("mods");
  if (
    !input.serversEqual ||
    input.remoteQuickServer !== (input.currentQuickServer || "")
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

  if (
    input.isOwner ||
    !areOtherFilesEqual(input.remoteOther, input.currentOther)
  ) {
    diff.push("other");
  }

  return diff;
}

export function formatShareDiffParts(diffParts: string[]) {
  return diffParts.length ? `${diffParts.join(", ")}, ` : "";
}
