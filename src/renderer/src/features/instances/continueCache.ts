import { IWorld } from "@/types/World";
import { IServer } from "@/types/ServersList";
import { isContinueCacheKeyFor } from "./continueTargets";

export interface ContinueSource {
  worlds: IWorld[];
  worldCount: number;
  hasSaves: boolean;
  servers: IServer[];
}

const cache = new Map<string, ContinueSource>();

export function readContinueCache(key: string): ContinueSource | undefined {
  return cache.get(key);
}

export function writeContinueCache(key: string, source: ContinueSource): void {
  cache.set(key, source);
}

export function forgetContinueCache(versionPath?: string): void {
  if (!versionPath) {
    cache.clear();
    return;
  }

  for (const key of [...cache.keys()]) {
    if (isContinueCacheKeyFor(key, versionPath)) cache.delete(key);
  }
}
