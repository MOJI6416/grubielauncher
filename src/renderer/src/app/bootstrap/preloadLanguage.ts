import i18n, { changeAppLanguage } from "@renderer/i18n";
import { normalizeSettings, TSettings } from "@/types/Settings";
import { resolveBootstrapLanguage } from "./bootstrapPlan";
import { getDefaultStore } from "jotai";
import { BUILT_IN_THEMES, findTheme } from "@/shared/themes";
import {
  hydrateUserThemes,
  userThemesAtom,
} from "@renderer/features/theme/themesStore";
import { applyThemeVariables } from "@renderer/features/theme/applyTheme";

const api = window.api;

export async function preloadAppLanguage(): Promise<void> {
  try {
    const paths = await api.other.getPaths();
    const settingsPath = await api.path.join(paths.launcher, "settings.json");

    const raw = (await api.fs.pathExists(settingsPath))
      ? await api.fs.readJSON<Partial<TSettings> | null>(settingsPath, "utf-8")
      : null;

    const systemLocale = await api.other.getLocale();
    const { lang, accent, themeId, highContrast } = normalizeSettings(
      raw,
      resolveBootstrapLanguage(systemLocale, i18n.language),
    );

    if (!BUILT_IN_THEMES.some((theme) => theme.id === themeId)) {
      await hydrateUserThemes(paths.launcher);
    }
    applyThemeVariables(
      findTheme(themeId, getDefaultStore().get(userThemesAtom)),
      accent,
      highContrast,
    );
    await changeAppLanguage(lang);
  } catch {}
}
