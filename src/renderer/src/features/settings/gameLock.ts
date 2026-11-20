import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { consolesMetaAtom, isRunningAtom } from "@renderer/stores/atoms";

export type GameLock = "launching" | "playing";

export function gameLockOf(
  launching: boolean,
  consoles: readonly { status: string }[],
): GameLock | null {
  if (launching) return "launching";
  return consoles.some((entry) => entry.status === "running")
    ? "playing"
    : null;
}

export function useGameLock(): GameLock | null {
  const launching = useAtomValue(isRunningAtom);
  const consoles = useAtomValue(consolesMetaAtom);
  return gameLockOf(launching, consoles);
}

export function useGameLockReason(): string | undefined {
  const { t } = useTranslation();
  const lock = useGameLock();
  return lock ? t(`app.locked.${lock}`) : undefined;
}
