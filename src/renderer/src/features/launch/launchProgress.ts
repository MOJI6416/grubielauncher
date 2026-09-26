import { atom, getDefaultStore } from "jotai";
import { isRunningAtom } from "@renderer/stores/atoms";

export type LaunchStage = "account" | "modpack" | "prepare" | "java" | "loader";

export interface LaunchProgress {
  versionName: string;
  instance: number;
  plan: LaunchStage[];
  stage: LaunchStage;
  startedAt: number;
  mods: number | null;
}

export const launchProgressAtom = atom<LaunchProgress | null>(null);
export const launchingVersionAtom = atom(
  (get) => get(launchProgressAtom)?.versionName ?? null,
);

const MOD_COUNT = /Loading (\d+) mods/;
const LOADER_MARKERS =
  /Fabric Loader|Quilt Loader|ModLauncher|Launching target|MIXIN Subsystem|FancyModLoader|net\.(?:minecraftforge|neoforged)\.fml/i;

export function planLaunchStages(input: {
  checksAccount: boolean;
  checksModpack: boolean;
  modded: boolean;
}): LaunchStage[] {
  const plan: LaunchStage[] = [];
  if (input.checksAccount) plan.push("account");
  if (input.checksModpack) plan.push("modpack");
  plan.push("prepare", "java");
  if (input.modded) plan.push("loader");
  return plan;
}

export function readLoaderSignal(text: string): { mods: number | null } | null {
  const count = MOD_COUNT.exec(text);
  if (count) return { mods: Number(count[1]) };
  return LOADER_MARKERS.test(text) ? { mods: null } : null;
}

export function advanceStage(
  progress: LaunchProgress,
  stage: LaunchStage,
): LaunchProgress {
  const target = progress.plan.indexOf(stage);
  if (target <= progress.plan.indexOf(progress.stage)) return progress;
  return { ...progress, stage };
}

export function applyGameOutput(
  progress: LaunchProgress,
  text: string,
): LaunchProgress {
  let next = advanceStage(progress, "java");
  if (!next.plan.includes("loader")) return next;

  const signal = readLoaderSignal(text);
  if (!signal) return next;

  next = advanceStage(next, "loader");
  return signal.mods !== null && signal.mods !== next.mods
    ? { ...next, mods: signal.mods }
    : next;
}

let stopTracking: (() => void) | null = null;

export function beginLaunchProgress(input: {
  versionName: string;
  instance: number;
  plan: LaunchStage[];
}): void {
  endLaunchProgress();

  const store = getDefaultStore();
  store.set(launchProgressAtom, {
    ...input,
    stage: input.plan[0],
    startedAt: Date.now(),
    mods: null,
  });

  const offOutput = window.api.events.onConsoleMessage(
    (versionName, instance, message) => {
      const current = store.get(launchProgressAtom);
      if (
        !current ||
        current.versionName !== versionName ||
        current.instance !== instance ||
        current.plan.indexOf(current.stage) < current.plan.indexOf("prepare")
      ) {
        return;
      }

      const next = applyGameOutput(current, String(message?.message ?? ""));
      if (next !== current) store.set(launchProgressAtom, next);
    },
  );
  const offRunning = store.sub(isRunningAtom, () => {
    if (!store.get(isRunningAtom)) endLaunchProgress();
  });

  stopTracking = () => {
    offOutput();
    offRunning();
  };
}

export function setLaunchStage(stage: LaunchStage): void {
  const store = getDefaultStore();
  const current = store.get(launchProgressAtom);
  if (!current) return;

  const next = advanceStage(current, stage);
  if (next !== current) store.set(launchProgressAtom, next);
}

export function endLaunchProgress(): void {
  stopTracking?.();
  stopTracking = null;
  getDefaultStore().set(launchProgressAtom, null);
}
