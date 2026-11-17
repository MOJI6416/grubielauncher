import i18n from "@renderer/i18n";
import {
  matchLanguage,
  normalizeSettings,
  type TSettings,
} from "@/types/Settings";
import {
  BUILT_IN_THEMES,
  findTheme,
  normalizeThemesFile,
} from "@/shared/themes";
import { applyThemeVariables } from "./applyTheme";

const api = window.api;

async function readJson<T>(path: string): Promise<T | null> {
  if (!(await api.fs.pathExists(path))) return null;
  return await api.fs.readJSON<T>(path, "utf-8");
}

export async function applyWindowAppearance(): Promise<string | null> {
  try {
    const { launcher } = await api.other.getPaths();
    if (!launcher) return null;

    const raw = await readJson<Partial<TSettings>>(
      await api.path.join(launcher, "settings.json"),
    );
    const systemLocale = await api.other.getLocale();
    const { lang, accent, themeId, highContrast } = normalizeSettings(
      raw,
      matchLanguage(systemLocale) ?? i18n.language,
    );

    const userThemes = BUILT_IN_THEMES.some((theme) => theme.id === themeId)
      ? []
      : normalizeThemesFile(
          await readJson<unknown>(
            await api.path.join(launcher, "themes", "themes.json"),
          ),
        ).themes;

    applyThemeVariables(
      { ...findTheme(themeId, userThemes), backdrop: null },
      accent,
      highContrast,
    );
    return lang;
  } catch {
    return null;
  }
}
