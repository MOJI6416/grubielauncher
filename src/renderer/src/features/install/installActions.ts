import { getDefaultStore } from "jotai";
import { installQueue } from "./installQueue";
import {
  downloaderInfoAtom,
  installCancellingAtom,
  installPauseStateAtom,
  installPausedAtom,
  installProgressAtom,
} from "./installUi";

const api = window.api;

export async function cancelActiveInstall(): Promise<void> {
  const store = getDefaultStore();
  store.set(installCancellingAtom, true);

  try {
    const [versionCancelled, modsCancelled] = await Promise.all([
      api.version.cancelInstall(),
      api.mods.cancelInstall(),
    ]);

    if (!versionCancelled && !modsCancelled) {
      store.set(installProgressAtom, null);
      store.set(downloaderInfoAtom, null);
      store.set(installCancellingAtom, false);
    }
  } catch {
    store.set(installCancellingAtom, false);
  }
}

export async function toggleInstallPause(): Promise<void> {
  const store = getDefaultStore();
  const next = !store.get(installPausedAtom);
  store.set(installPausedAtom, next);
  store.set(installPauseStateAtom, next ? "pending" : "off");

  try {
    const applied = next
      ? await api.version.pauseInstall()
      : await api.version.resumeInstall();

    if (!applied) {
      store.set(installPausedAtom, !next);
      store.set(installPauseStateAtom, next ? "off" : "held");
    }
  } catch {
    store.set(installPausedAtom, !next);
    store.set(installPauseStateAtom, next ? "off" : "held");
  }
}

export function cancelQueuedInstall(id: string): void {
  installQueue.cancelPending(id);
}
