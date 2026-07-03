import { getDefaultStore } from "jotai";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import { TSettings } from "@/types/Settings";

const api = window.api;

export async function patchSettings(patch: Partial<TSettings>): Promise<void> {
  const store = getDefaultStore();
  const next = { ...store.get(settingsAtom), ...patch };

  const { launcher } = store.get(pathsAtom);
  if (launcher) {
    const settingsPath = await api.path.join(launcher, "settings.json");
    await api.fs.writeJSON(settingsPath, next);
  }

  store.set(settingsAtom, next);
}
