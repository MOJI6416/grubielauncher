import { atom } from "jotai";
import type { AppUpdateState } from "@/types/AppUpdate";

export const appUpdateAtom = atom<AppUpdateState>({ status: "idle" });

export type UpdateBlock = "game" | "install" | null;

export function updateBlock({
  isGameRunning,
  isInstallActive,
}: {
  isGameRunning: boolean;
  isInstallActive: boolean;
}): UpdateBlock {
  if (isGameRunning) return "game";
  if (isInstallActive) return "install";
  return null;
}

export function readyVersion(state: AppUpdateState): string | null {
  return state.status === "ready" ? state.version : null;
}
