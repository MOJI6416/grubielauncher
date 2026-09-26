import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import { settingsAtom } from "@renderer/stores/atoms";
import { applyAccent } from "@renderer/app/theme/accent";

export function AccentHost() {
  const settings = useAtomValue(settingsAtom);
  const isLoaded = settings !== DEFAULT_SETTINGS;

  useEffect(() => {
    if (isLoaded) applyAccent(settings.accent);
  }, [isLoaded, settings.accent]);

  return null;
}
