import { useEffect, useRef } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { DEFAULT_SETTINGS, type StartScreen } from "@/types/Settings";
import {
  accountAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import { historyAtom } from "@renderer/navigation/store";
import { navigate } from "@renderer/navigation/navigate";
import { selectInstance } from "@renderer/features/instances/selectInstance";
import { instanceKey } from "@renderer/features/instances/selectors";

function isStillOnLaunchScreen(): boolean {
  const history = getDefaultStore().get(historyAtom);
  return history.entries.length === 1 && history.entries[0].route.name === "home";
}

function openStartScreen(screen: StartScreen): void {
  const store = getDefaultStore();

  if (screen === "people" || screen === "news") {
    navigate({ name: screen }, { replace: true });
    return;
  }

  if (screen === "lastInstance") {
    const instance = store.get(selectedVersionAtom);
    if (!instance) return;
    void selectInstance(instance, store.get(accountAtom));
    navigate({ name: "instance", id: instanceKey(instance) }, { replace: true });
  }
}

export function StartScreenHost() {
  const settings = useAtomValue(settingsAtom);
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const isDone = useRef(false);

  useEffect(() => {
    if (isDone.current) return;
    if (settings === DEFAULT_SETTINGS || !versionsLoaded) return;

    isDone.current = true;
    if (settings.startScreen !== "home" && isStillOnLaunchScreen()) {
      openStartScreen(settings.startScreen);
    }
  }, [settings, versionsLoaded]);

  return null;
}
