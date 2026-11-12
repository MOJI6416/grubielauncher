import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import { settingsAtom } from "@renderer/stores/atoms";
import { useActiveTheme } from "@renderer/features/theme/themesStore";
import { applyThemeVariables } from "@renderer/features/theme/applyTheme";
import { titleBarColors } from "@/shared/themes";

export function ThemeHost() {
  const settings = useAtomValue(settingsAtom);
  const theme = useActiveTheme();
  const isLoaded = settings !== DEFAULT_SETTINGS;

  useEffect(() => {
    if (isLoaded) applyThemeVariables(theme, settings.accent, settings.highContrast);
  }, [isLoaded, theme, settings.accent, settings.highContrast]);

  const { color, symbolColor } = titleBarColors(theme);
  useEffect(() => {
    if (isLoaded) void window.api.other.setTitleBarColors(color, symbolColor).catch(() => undefined);
  }, [isLoaded, color, symbolColor]);

  return null;
}
