import { atom, getDefaultStore } from "jotai";
import i18n from "@renderer/i18n";
import { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { pathsAtom } from "@renderer/stores/atoms";
import {
  readLauncherState,
  writeLauncherState,
} from "@renderer/utilities/launcherState";
import { consumeRecentFailure } from "@renderer/utilities/failures";
import {
  getWhatsNewDecision,
  markWhatsNewSeen,
} from "@renderer/utilities/whatsNew";

const api = window.api;

export interface WhatsNewView {
  version: string;
  release: ILauncherReleaseNote | null;
  persist: boolean;
}

export const whatsNewAtom = atom<WhatsNewView | null>(null);

export const currentReleaseAtom = atom<ILauncherReleaseNote | null>(null);

export const whatsNewLoadingAtom = atom(false);

function currentLocale(): string {
  return i18n.resolvedLanguage || i18n.language || "en";
}

let loadedReleaseLocale = "";

export function loadCurrentRelease(locale: string): void {
  if (loadedReleaseLocale === locale) return;
  loadedReleaseLocale = locale;

  void (async () => {
    try {
      const version = await api.other.getVersion();
      if (!version) return;

      const release = await api.backend.getWhatsNew(version, locale);
      if (loadedReleaseLocale !== locale) return;

      getDefaultStore().set(currentReleaseAtom, release);
    } catch {
      if (loadedReleaseLocale === locale) loadedReleaseLocale = "";
    }
  })();
}

export async function openWhatsNew(options?: {
  launcherPath?: string;
  locale?: string;
}): Promise<void> {
  const store = getDefaultStore();
  const launcherPath = options?.launcherPath || store.get(pathsAtom).launcher;
  if (!launcherPath) return;
  if (store.get(whatsNewLoadingAtom)) return;

  store.set(whatsNewLoadingAtom, true);

  try {
    const currentVersion = await api.other.getVersion();
    if (!currentVersion) return;

    const locale = options?.locale || currentLocale();
    const release = await api.backend.getWhatsNew(currentVersion, locale);
    const failed =
      !release &&
      Boolean(consumeRecentFailure({ channels: ["backend:getWhatsNew"] }));

    loadedReleaseLocale = locale;
    store.set(currentReleaseAtom, release);
    store.set(whatsNewAtom, {
      version: currentVersion,
      release,
      persist: !failed,
    });
  } finally {
    store.set(whatsNewLoadingAtom, false);
  }
}

export function openReleaseNote(release: ILauncherReleaseNote): void {
  getDefaultStore().set(whatsNewAtom, {
    version: release.version,
    release,
    persist: false,
  });
}

export async function dismissWhatsNew(): Promise<void> {
  const store = getDefaultStore();
  const view = store.get(whatsNewAtom);
  store.set(whatsNewAtom, null);

  const launcherPath = store.get(pathsAtom).launcher;
  if (!launcherPath || !view?.version || !view.persist) return;

  const state = await readLauncherState(launcherPath);
  await writeLauncherState(launcherPath, markWhatsNewSeen(view.version, state));
}

export async function checkWhatsNewAfterInit(
  launcherPath: string,
  locale: string,
): Promise<void> {
  const currentVersion = await api.other.getVersion();
  if (!currentVersion) return;

  const state = await readLauncherState(launcherPath);
  const decision = getWhatsNewDecision(currentVersion, state);

  if (decision.type === "firstLaunch") {
    await writeLauncherState(
      launcherPath,
      markWhatsNewSeen(currentVersion, state),
    );
    return;
  }

  if (decision.shouldShow) {
    await openWhatsNew({ launcherPath, locale });
  }
}
