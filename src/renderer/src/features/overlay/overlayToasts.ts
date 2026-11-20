import { atom, getDefaultStore } from "jotai";
import {
  consolesAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { countFeature } from "@renderer/features/usage/usage";
import {
  type QueuedToast,
  isFullscreenOptions,
  latestActionable,
  pruneToasts,
  upsertToast,
} from "./toastQueue";

const api = window.api;

export const overlayToastsAtom = atom<QueuedToast[]>([]);

type ToastInput = Omit<QueuedToast, "count" | "shownAt" | "expiresAt">;

async function isRunningGameFullscreen(): Promise<boolean> {
  const store = getDefaultStore();
  const running = new Set(
    store
      .get(consolesAtom)
      .consoles.filter((entry) => entry.status === "running")
      .map((entry) => entry.versionName),
  );
  const versions = store
    .get(versionsAtom)
    .filter((version) => running.has(version.version.name));

  for (const version of versions) {
    try {
      const file = api.path.join(version.versionPath, "options.txt");
      if (!(await api.fs.pathExists(file))) continue;
      if (isFullscreenOptions(await api.fs.readFile(file, "utf-8"))) return true;
    } catch (error) {
      console.warn("[overlay] options.txt unreadable", error);
    }
  }
  return false;
}

export async function canShowOverlayToast(): Promise<boolean> {
  const store = getDefaultStore();
  if (!store.get(settingsAtom).overlayToasts) return false;
  if (document.hasFocus()) return false;

  const isGameRunning = store
    .get(consolesAtom)
    .consoles.some((entry) => entry.status === "running");
  if (!isGameRunning) return false;

  return !(await isRunningGameFullscreen());
}

export async function showOverlayToast(input: ToastInput): Promise<boolean> {
  if (!(await canShowOverlayToast())) return false;

  const store = getDefaultStore();
  store.set(overlayToastsAtom, (list) =>
    upsertToast(pruneToasts(list, Date.now()), input, Date.now()),
  );
  return true;
}

export function dismissOverlayToast(id: string) {
  getDefaultStore().set(overlayToastsAtom, (list) =>
    list.some((toast) => toast.id === id)
      ? list.filter((toast) => toast.id !== id)
      : list,
  );
}

export function acceptOverlayToast(): boolean {
  const store = getDefaultStore();
  const list = pruneToasts(store.get(overlayToastsAtom), Date.now());
  const target = latestActionable(list);
  if (!target?.accept) return false;

  store.set(
    overlayToastsAtom,
    list.filter((toast) => toast.id !== target.id),
  );
  countFeature("overlay.accept");
  target.accept();
  return true;
}
