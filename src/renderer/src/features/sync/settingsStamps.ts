import { getDefaultStore } from "jotai";
import { pathsAtom } from "@renderer/stores/atoms";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import {
  initialStamps,
  normalizeStamps,
  stampChanges,
  type SettingsStamps,
} from "@/shared/settingsSync";
import type { TSettings } from "@/types/Settings";
import { scheduleAccountSync } from "./syncSchedule";

const api = window.api;

const FIRST_SYNC_STAMP = 1;

let loaded: SettingsStamps | null = null;
let pending: SettingsStamps = {};
let loading: Promise<SettingsStamps | null> | null = null;

function syncDir(): string | null {
  const { launcher } = getDefaultStore().get(pathsAtom);
  return launcher ? api.path.join(launcher, "sync") : null;
}

function stampsFile(): string | null {
  const dir = syncDir();
  return dir ? api.path.join(dir, "settings.json") : null;
}

async function persist(): Promise<void> {
  const dir = syncDir();
  if (!dir || !loaded) return;
  if (!(await api.fs.ensure(dir))) return;
  await api.fs.writeJSON(api.path.join(dir, "settings.json"), { version: 1, stamps: loaded });
}

export function loadSettingsStamps(settings: TSettings): Promise<SettingsStamps | null> {
  if (loaded) return Promise.resolve(loaded);

  loading ??= (async () => {
    const file = stampsFile();
    if (!file) return null;

    const stamps = (await api.fs.pathExists(file))
      ? normalizeStamps(
          (await api.fs.readJSON<{ stamps?: unknown }>(file, "utf-8").catch(ignoreFailure))?.stamps,
        )
      : initialStamps(settings, FIRST_SYNC_STAMP);

    for (const [key, stamp] of Object.entries(pending) as [keyof SettingsStamps, number][]) {
      stamps[key] = Math.max(stamps[key] ?? 0, stamp);
    }
    pending = {};
    loaded = stamps;
    await persist();
    return stamps;
  })().finally(() => {
    loading = null;
  });

  return loading;
}

export function currentSettingsStamps(): SettingsStamps | null {
  return loaded;
}

export function recordSettingsChange(previous: TSettings, next: TSettings): void {
  const changed = stampChanges(previous, next, loaded ?? pending, Date.now());
  if (!changed) return;

  if (loaded) {
    loaded = changed;
    void persist();
  } else {
    pending = changed;
  }
  scheduleAccountSync();
}

export async function adoptSettingsStamps(stamps: SettingsStamps): Promise<void> {
  loaded = stamps;
  await persist();
}
