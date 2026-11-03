import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import { settingsAtom } from "@renderer/stores/atoms";
import { useActiveTheme } from "@renderer/features/theme/themesStore";
import { applyThemeVariables } from "@renderer/features/theme/applyTheme";

export function ThemeHost() {
  const settings = useAtomValue(settingsAtom);
  const theme = useActiveTheme();
  const isLoaded = settings !== DEFAULT_SETTINGS;

  useEffect(() => {
    if (isLoaded) applyThemeVariables(theme, settings.accent, settings.highContrast);
  }, [isLoaded, theme, settings.accent, settings.highContrast]);

  return null;
}
