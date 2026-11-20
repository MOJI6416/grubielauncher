import { atom, getDefaultStore } from "jotai";
import {
  accountAtom,
  authDataAtom,
  networkAtom,
  pathsAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { changeAppLanguage } from "@renderer/i18n";
import { updateStreamingWatch } from "@renderer/features/streamer/streamerMode";
import { applyRemoteSettings, settingsPushPayload } from "@/shared/settingsSync";
import { DEFAULT_SETTINGS, type TSettings } from "@/types/Settings";
import type { AccountSyncFailure } from "@/types/AccountSync";
import {
  adoptSettingsStamps,
  currentSettingsStamps,
  loadSettingsStamps,
} from "./settingsStamps";
import { setAccountSyncRunner } from "./syncSchedule";
import { syncThemes } from "./themesSync";

const api = window.api;

export const wardrobeSyncedAtom = atom(0);

let unsupported = false;
let running: Promise<void> | null = null;
let again = false;

async function syncSettings(token: string): Promise<AccountSyncFailure | null> {
  const store = getDefaultStore();
  const stamps = await loadSettingsStamps(store.get(settingsAtom));
  if (!stamps) return "failed";

  const result = await api.sync.settings(
    token,
    settingsPushPayload(store.get(settingsAtom), stamps),
  );
  if (!result.ok) return result.reason;

  let applied: Partial<TSettings> = {};
  let nextStamps = stamps;
  await patchSettings(
    (current) => {
      const merged = applyRemoteSettings(current, currentSettingsStamps() ?? stamps, result.data);
      applied = merged.patch;
      nextStamps = merged.stamps;
      return merged.patch;
    },
    { synced: true },
  );
  await adoptSettingsStamps(nextStamps);

  if (applied.lang) await changeAppLanguage(applied.lang);
  if (typeof applied.streamerModeAuto === "boolean") {
    updateStreamingWatch(applied.streamerModeAuto);
  }
  return null;
}

function readyContext() {
  const store = getDefaultStore();
  const settings = store.get(settingsAtom);
  const account = store.get(accountAtom);
  const userId = store.get(authDataAtom)?.sub;
  const { launcher } = store.get(pathsAtom);
  if (settings === DEFAULT_SETTINGS || !settings.accountSync) return null;
  if (!account?.accessToken || account.type === "plain" || !userId || !launcher) return null;
  if (!store.get(networkAtom)) return null;
  return { token: account.accessToken, userId, launcher };
}

async function syncOnce(): Promise<void> {
  const context = readyContext();
  if (!context || unsupported) return;

  const store = getDefaultStore();
  const failures: (AccountSyncFailure | null)[] = [];
  failures.push(await syncThemes(context.token, context.userId).catch(() => "failed" as const));
  failures.push(await syncSettings(context.token).catch(() => "failed" as const));

  const wardrobe = await api.sync
    .wardrobe(context.token, context.launcher, context.userId)
    .catch(() => ({ ok: false as const, reason: "failed" as const }));
  if (wardrobe.ok) {
    if (wardrobe.changed) store.set(wardrobeSyncedAtom, (value) => value + 1);
  } else {
    failures.push(wardrobe.reason);
  }

  if (failures.includes("unsupported")) unsupported = true;
}

export function runAccountSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }

  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });

  return running;
}

setAccountSyncRunner(() => void runAccountSync());
