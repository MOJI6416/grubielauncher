import { atom, getDefaultStore } from "jotai";
import type {
  SupportReply,
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
import { countFeature } from "@renderer/features/usage/usage";

export interface SupportDialogRequest {
  trigger: SupportReportTrigger;
  versionName?: string;
}

export const supportDialogAtom = atom<SupportDialogRequest | null>(null);

export const supportRepliesAtom = atom<SupportReply[] | null>(null);

export function mergeSupportReply(
  current: SupportReply[] | null,
  reply: SupportReply,
): SupportReply[] {
  return [reply, ...(current ?? []).filter((item) => item.code !== reply.code)];
}

export function markSupportReplySeen(
  current: SupportReply[] | null,
  code: string,
): SupportReply[] | null {
  return current
    ? current.map((item) => (item.code === code ? { ...item, seen: true } : item))
    : current;
}

export function toLiveSupportReply(payload: unknown): SupportReply | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (
    typeof data.code !== "string" ||
    typeof data.reply !== "string" ||
    !data.reply ||
    typeof data.repliedAt !== "string"
  ) {
    return null;
  }
  return {
    code: data.code,
    instanceName: "",
    createdAt: data.repliedAt,
    reply: data.reply.slice(0, 4000),
    repliedAt: data.repliedAt,
    seen: false,
  };
}

export function openSupportReport(
  trigger: SupportReportTrigger,
  versionName?: string,
): void {
  uiJournal.info("support", "report dialog opened", { trigger, versionName });
  countFeature("feature.supportReport");
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
