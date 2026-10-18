import { atom } from "jotai";
import type { FailureInfo } from "@/shared/errors";
import type { ModpackDiff } from "@/shared/modpackDiff";
import type { IServer } from "@/types/ServersList";
import type { IBlockedMod } from "@renderer/utilities/blockedMods";
import type { RunGameParams } from "./types";

export const pendingLaunchAtom = atom<RunGameParams | null>(null);
export const launchUpdateOpenAtom = atom(false);
export const launchUpdateDiffAtom = atom<ModpackDiff | null>(null);
export const launchServersAtom = atom<IServer[]>([]);
export const launchUpdateRemoteServersAtom = atom<string[]>([]);
export const launchCheckFailedAtom = atom<{
  params: RunGameParams;
  failure: FailureInfo | null;
} | null>(null);
export const blockedModsAtom = atom<IBlockedMod[]>([]);
export const blockedModsOpenAtom = atom(false);

export interface BlockedModsResume {
  run: (resolved: IBlockedMod[] | null) => Promise<void>;
}

export const blockedModsResumeAtom = atom<BlockedModsResume | null>(null);
