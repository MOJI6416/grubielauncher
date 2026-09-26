import { atom, getDefaultStore } from "jotai";
import type {
  SupportReportTrigger,
  SupportReportUiState,
} from "@/types/Journal";
import { currentRouteAtom } from "@renderer/navigation/store";
import {
  consolesAtom,
  installActiveAtom,
  isRunningAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { isOnlineSocketConnected } from "@renderer/utilities/onlineSocket";
import { uiJournal } from "@renderer/utilities/journal";

export interface SupportDialogRequest {
  trigger: SupportReportTrigger;
  versionName?: string;
}

export const supportDialogAtom = atom<SupportDialogRequest | null>(null);

export function openSupportReport(
  trigger: SupportReportTrigger,
  versionName?: string,
): void {
  uiJournal.info("support", "report dialog opened", { trigger, versionName });
  getDefaultStore().set(supportDialogAtom, { trigger, versionName });
}

export function collectSupportUiState(): SupportReportUiState {
  const store = getDefaultStore();
  const route = store.get(currentRouteAtom);

  return {
    route: route ? JSON.stringify(route) : undefined,
    lang: store.get(settingsAtom).lang,
    isRunning: store.get(isRunningAtom),
    installActive: store.get(installActiveAtom),
    onlineConnected: isOnlineSocketConnected(),
    consoles: store.get(consolesAtom).consoles.map((console) => ({
      versionName: console.versionName,
      instance: console.instance,
      status: console.status,
      startTime: console.startTime,
    })),
  };
}

export function formatReportBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
