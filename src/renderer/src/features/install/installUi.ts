import { atom, getDefaultStore } from "jotai";
import { DownloaderFailuresInfo, DownloaderInfo } from "@/types/Downloader";
import { VersionInstallProgress } from "@/types/InstallationProgress";
import { MirrorMode } from "@/shared/mirrorMode";
import { StageEvent } from "./progressModel";
import { InstallTaskMeta } from "./installQueue";
import { TaskRecord } from "./taskHistory";

export type TaskCenterView = "tasks" | "failures";
export type InstallPauseState = "off" | "pending" | "held";

export const taskCenterOpenAtom = atom(false);
export const taskCenterViewAtom = atom<TaskCenterView>("tasks");
export const connectivityCheckOpenAtom = atom(false);

export const installProgressAtom = atom<VersionInstallProgress | null>(null);
export const downloaderInfoAtom = atom<DownloaderInfo | null>(null);
export const installStageLogAtom = atom<StageEvent[]>([]);
export const installSpeedAtom = atom<number | null>(null);
export const installPausedAtom = atom(false);
export const installPauseStateAtom = atom<InstallPauseState>("off");
export const installCancellingAtom = atom(false);
export const installQueuedAtom = atom<InstallTaskMeta[]>([]);
export const installHistoryAtom = atom<TaskRecord[]>([]);
export const installFailuresAtom = atom<DownloaderFailuresInfo | null>(null);
export const installFailuresSeenAtom = atom(true);
export const mirrorModeAtom = atom<MirrorMode | null>(null);

export function openTaskCenter(view: TaskCenterView = "tasks"): void {
  const store = getDefaultStore();
  store.set(taskCenterViewAtom, view);
  store.set(taskCenterOpenAtom, true);
  if (view === "failures") store.set(installFailuresSeenAtom, true);
}

export function closeTaskCenter(): void {
  getDefaultStore().set(taskCenterOpenAtom, false);
}

export function openConnectivityCheck(): void {
  getDefaultStore().set(connectivityCheckOpenAtom, true);
}
