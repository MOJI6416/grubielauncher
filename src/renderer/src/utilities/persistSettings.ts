import { getDefaultStore } from "jotai";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import { TSettings } from "@/types/Settings";
import { recordSettingsChange } from "@renderer/features/sync/settingsStamps";

const api = window.api;

let writeQueue: Promise<void> = Promise.resolve();

type SettingsPatch = Partial<TSettings> | ((current: TSettings) => Partial<TSettings>);

export async function patchSettings(
  patch: SettingsPatch,
  options: { synced?: boolean } = {},
): Promise<void> {
  const run = writeQueue.then(async () => {
    const store = getDefaultStore();
    const { launcher } = store.get(pathsAtom);

    if (!launcher) {
      throw new Error("Launcher path is not ready, settings were not saved");
    }

    const previous = store.get(settingsAtom);
    const changes = typeof patch === "function" ? patch(previous) : patch;
    if (typeof patch === "function" && Object.keys(changes).length === 0) return;

    const settingsPath = await api.path.join(launcher, "settings.json");
    const next = { ...previous, ...changes };

    if (!(await api.fs.writeJSON(settingsPath, next))) {
      throw new Error("settings.json was not written");
    }

    store.set(settingsAtom, next);
    if (!options.synced) recordSettingsChange(previous, next);
  });

  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}
