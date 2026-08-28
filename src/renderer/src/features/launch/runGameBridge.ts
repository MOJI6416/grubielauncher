import { IConsole } from "@/types/Console";
import type { RunGameParams } from "./types";

export type GameRunner = (params: RunGameParams) => Promise<void>;

let runner: GameRunner | null = null;

export function registerGameRunner(next: GameRunner): () => void {
  runner = next;

  return () => {
    if (runner === next) runner = null;
  };
}

export function getGameRunner(): GameRunner | null {
  return runner;
}

export function countRunningConsoles(
  consoles: Pick<IConsole, "versionName" | "status">[],
  versionName: string,
): number {
  return consoles.filter(
    (entry) => entry.versionName === versionName && entry.status === "running",
  ).length;
}
