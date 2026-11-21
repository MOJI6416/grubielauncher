import { atom, getDefaultStore } from "jotai";
import { countFeature } from "@renderer/features/usage/usage";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

export const bigModeOpenAtom = atom(false);

export function isBigModeOpen(): boolean {
  return getDefaultStore().get(bigModeOpenAtom);
}

export function openBigMode(options: { counted?: boolean } = {}): void {
  const store = getDefaultStore();
  if (store.get(bigModeOpenAtom)) return;
  store.set(bigModeOpenAtom, true);
  void api.other.setFullScreen(true).catch(ignoreFailure);
  if (options.counted !== false) countFeature("bigMode.open");
}

export function closeBigMode(): void {
  const store = getDefaultStore();
  if (!store.get(bigModeOpenAtom)) return;
  store.set(bigModeOpenAtom, false);
  void api.other.setFullScreen(false).catch(ignoreFailure);
}

export function toggleBigMode(): void {
  if (isBigModeOpen()) closeBigMode();
  else openBigMode();
}
