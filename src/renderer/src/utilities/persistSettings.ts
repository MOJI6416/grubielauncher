import { getDefaultStore } from "jotai";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import { TSettings } from "@/types/Settings";

const api = window.api;

let writeQueue: Promise<void> = Promise.resolve();

export async function patchSettings(patch: Partial<TSettings>): Promise<void> {
  const run = writeQueue.then(async () => {
    const store = getDefaultStore();
    const { launcher } = store.get(pathsAtom);

    if (!launcher) {
      throw new Error("Launcher path is not ready, settings were not saved");
    }

    const settingsPath = await api.path.join(launcher, "settings.json");
    const next = { ...store.get(settingsAtom), ...patch };

    if (!(await api.fs.writeJSON(settingsPath, next))) {
      throw new Error("settings.json was not written");
    }

    store.set(settingsAtom, next);
  });

  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}
