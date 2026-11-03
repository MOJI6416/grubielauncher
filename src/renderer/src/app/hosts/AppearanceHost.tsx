import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import { setMotionSetting } from "@/lib/motionPreference";
import { settingsAtom } from "@renderer/stores/atoms";

export function AppearanceHost() {
  const settings = useAtomValue(settingsAtom);
  const isLoaded = settings !== DEFAULT_SETTINGS;

  useEffect(() => {
    if (isLoaded) setMotionSetting(settings.motion);
  }, [isLoaded, settings.motion]);

  useEffect(() => {
    const root = document.documentElement;
    if (isLoaded && settings.highContrast) root.dataset.contrast = "more";
    else delete root.dataset.contrast;
  }, [isLoaded, settings.highContrast]);

  return null;
}
