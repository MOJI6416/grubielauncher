import { atom } from "jotai";

export type VersionDiffence = "sync" | "new" | "old";

export interface InstanceFlags {
  hasStatistics: boolean;
  hasServer: boolean;
  hasSaves?: boolean;
}

export const instanceFlagsAtom = atom<Record<string, InstanceFlags>>({});

export const instanceSelectionSignatureAtom = atom<string | null>(null);

export const instanceDiffenceAtom = atom<VersionDiffence>("sync");

export const instancePublishDiffAtom = atom<string>("");
