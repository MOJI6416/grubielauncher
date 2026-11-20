import { useEffect } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import type {
  ModBisectApplyResult,
  ModBisectBeginResult,
  ModBisectSession,
} from "@/types/ModBisect";
import { forgetAllModFiles } from "@renderer/features/mods/modFiles";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

export const bisectSessionsAtom = atom<
  Record<string, ModBisectSession | null>
>({});

export interface BisectSetupRequest {
  versionPath: string;
  candidates?: string[];
  kept?: string[];
}

export const bisectSetupAtom = atom<BisectSetupRequest | null>(null);

function remember(versionPath: string, session: ModBisectSession | null) {
  const store = getDefaultStore();
  store.set(bisectSessionsAtom, (previous) => ({
    ...previous,
    [versionPath]: session,
  }));
}

export function isBisectActive(versionPath: string | undefined): boolean {
  if (!versionPath) return false;
  return !!getDefaultStore().get(bisectSessionsAtom)[versionPath];
}

export async function loadBisect(
  versionPath: string,
): Promise<ModBisectSession | null> {
  const session = await api.bisect.read(versionPath);
  remember(versionPath, session);
  return session;
}

export async function loadActiveBisects(
  versionPaths: string[],
): Promise<string[]> {
  if (versionPaths.length === 0) return [];
  const active = await api.bisect.list(versionPaths);
  await Promise.all(
    active.map((versionPath) => loadBisect(versionPath).catch(ignoreFailure)),
  );
  return active;
}

export async function beginBisect(
  versionPath: string,
  draft: ModBisectSession,
): Promise<ModBisectBeginResult> {
  const result = await api.bisect.begin(versionPath, draft);
  forgetAllModFiles(versionPath);
  if (result.ok) remember(versionPath, result.session);
  else if (result.reason === "exists") await loadBisect(versionPath);
  return result;
}

export async function saveBisect(
  versionPath: string,
  session: ModBisectSession,
): Promise<ModBisectApplyResult> {
  const result = await api.bisect.save(versionPath, session);
  forgetAllModFiles(versionPath);
  if (result.ok) remember(versionPath, session);
  else if (result.reason === "missing") remember(versionPath, null);
  return result;
}

export async function finishBisect(
  versionPath: string,
  disable: string[],
): Promise<ModBisectApplyResult> {
  const result = await api.bisect.finish(versionPath, disable);
  forgetAllModFiles(versionPath);
  if (
    (result.ok && result.failed.length === 0) ||
    (!result.ok && result.reason === "missing")
  )
    remember(versionPath, null);
  return result;
}

export function useBisectSession(
  versionPath: string | undefined,
): ModBisectSession | null | undefined {
  const sessions = useAtomValue(bisectSessionsAtom);
  const known = versionPath ? versionPath in sessions : false;
  useEffect(() => {
    if (!versionPath || known) return;
    void loadBisect(versionPath).catch(ignoreFailure);
  }, [known, versionPath]);
  return versionPath ? sessions[versionPath] : undefined;
}
