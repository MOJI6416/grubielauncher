import {
  ACCENTS,
  DEFAULT_ACCENT,
  accentVariables,
  isAccentId,
} from "@/shared/accents";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  themeVariables,
  type ThemeDefinition,
} from "@/shared/themes";

const THEMED_VARIABLES = new Set([
  ...Object.keys(accentVariables(DEFAULT_ACCENT)),
  ...Object.keys(
    themeVariables(
      {
        ...BUILT_IN_THEMES.find((theme) => theme.mode === "light")!,
        backdrop: { path: "x", dim: 0, blur: 0, panelOpacity: 90 },
      },
      ACCENTS[DEFAULT_ACCENT].primary,
    ),
  ),
]);

export function themeVariablesFor(
  theme: ThemeDefinition,
  accentId: unknown,
  highContrast: boolean,
): Record<string, string> {
  const accent = isAccentId(accentId) ? accentId : DEFAULT_ACCENT;
  if (theme.id !== DEFAULT_THEME_ID) {
    return themeVariables(theme, ACCENTS[accent].primary, highContrast);
  }
  return accent === DEFAULT_ACCENT ? {} : accentVariables(accent);
}

export function applyThemeVariables(
  theme: ThemeDefinition,
  accentId: unknown,
  highContrast: boolean,
): void {
  const variables = themeVariablesFor(theme, accentId, highContrast);
  const root = document.documentElement;

  for (const name of THEMED_VARIABLES) {
    if (!(name in variables)) root.style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  root.dataset.accent = isAccentId(accentId) ? accentId : DEFAULT_ACCENT;
  root.dataset.theme = theme.id;
  root.dataset.themeMode = theme.mode;
}
