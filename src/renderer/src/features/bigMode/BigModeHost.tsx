import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import { settingsAtom } from "@renderer/stores/atoms";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { loadLauncherRuntime } from "@renderer/app/launcherRuntime";
import { BigMode } from "./BigMode";
import { bigModeOpenAtom, openBigMode } from "./bigModeStore";

export function BigModeHost() {
  const open = useAtomValue(bigModeOpenAtom);
  const settings = useAtomValue(settingsAtom);
  const isLoaded = settings !== DEFAULT_SETTINGS;
  const startChecked = useRef(false);

  useEffect(() => {
    if (!isLoaded || startChecked.current) return;
    startChecked.current = true;
    if (settings.bigModeOnStart) {
      openBigMode({ counted: false });
      return;
    }
    void loadLauncherRuntime()
      .then((runtime) => {
        if (runtime.bigModeStart) openBigMode({ counted: false });
      })
      .catch(ignoreFailure);
  }, [isLoaded, settings.bigModeOnStart]);

  return open ? <BigMode /> : null;
}
