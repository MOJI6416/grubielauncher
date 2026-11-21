import { useEffect } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import type { LauncherRuntime } from "@/types/LauncherRuntime";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

const launcherRuntimeAtom = atom<LauncherRuntime | null>(null);

let loading: Promise<LauncherRuntime> | null = null;

export function loadLauncherRuntime(): Promise<LauncherRuntime> {
  loading ??= api.other.getRuntime().then((runtime) => {
    getDefaultStore().set(launcherRuntimeAtom, runtime);
    return runtime;
  });
  return loading;
}

export function useLauncherRuntime(): LauncherRuntime | null {
  const runtime = useAtomValue(launcherRuntimeAtom);

  useEffect(() => {
    void loadLauncherRuntime().catch(ignoreFailure);
  }, []);

  return runtime;
}
