import { useMemo } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import type { TSettings } from "@/types/Settings";
import { maskValue, redactPath, redactText } from "./redact";

const api = window.api;

export type StreamerState = {
  active: boolean;
  reason: "manual" | "auto" | null;
  app: string | null;
};

export const streamingAppAtom = atom<string | null>(null);
export const streamerDismissedAtom = atom<string | null>(null);

export const streamerStateAtom = atom<StreamerState>((get) => {
  const settings = get(settingsAtom);
  const app = settings.streamerModeAuto ? get(streamingAppAtom) : null;

  if (settings.streamerMode) return { active: true, reason: "manual", app };
  if (app && get(streamerDismissedAtom) !== app) {
    return { active: true, reason: "auto", app };
  }
  return { active: false, reason: null, app };
});

export const streamerActiveAtom = atom((get) => get(streamerStateAtom).active);

let watch: { auto: boolean; done: Promise<void> } | null = null;

function applyDetected(app: string | null): void {
  const store = getDefaultStore();
  store.set(streamingAppAtom, app);
  if (!app) store.set(streamerDismissedAtom, null);
}

export function startStreamingWatch(auto: boolean): Promise<void> {
  if (watch?.auto === auto) return watch.done;
  const done = api.streamer.watch(auto).then(applyDetected);
  watch = { auto, done };
  return done;
}

export function updateStreamingWatch(auto: boolean): void {
  if (watch) void startStreamingWatch(auto);
}

export function subscribeStreamingApp(): () => void {
  return api.streamer.onDetected(applyDetected);
}

export async function setStreamerMode(
  active: boolean,
  write: (patch: Partial<TSettings>) => Promise<void> = patchSettings,
): Promise<void> {
  const store = getDefaultStore();
  const { app } = store.get(streamerStateAtom);

  if (active) {
    store.set(streamerDismissedAtom, null);
    if (!app) await write({ streamerMode: true });
    return;
  }

  if (app) store.set(streamerDismissedAtom, app);
  if (store.get(settingsAtom).streamerMode) {
    await write({ streamerMode: false });
  }
}

export function isStreamerActive(): boolean {
  return getDefaultStore().get(streamerActiveAtom);
}

export function useStreamerState(): StreamerState {
  return useAtomValue(streamerStateAtom);
}

export function useRedact() {
  const active = useAtomValue(streamerActiveAtom);

  return useMemo(
    () => ({
      active,
      path: (value: string) => (active ? redactPath(value) : value),
      text: (value: string) => (active ? redactText(value) : value),
      value: (value: string) => (active ? maskValue(value) : value),
    }),
    [active],
  );
}
