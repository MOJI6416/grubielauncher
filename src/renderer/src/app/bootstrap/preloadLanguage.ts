import i18n, { changeAppLanguage } from "@renderer/i18n";
import { normalizeSettings, TSettings } from "@/types/Settings";
import { resolveBootstrapLanguage } from "./bootstrapPlan";

const api = window.api;

export async function preloadAppLanguage(): Promise<void> {
  try {
    const paths = await api.other.getPaths();
    const settingsPath = await api.path.join(paths.launcher, "settings.json");

    const raw = (await api.fs.pathExists(settingsPath))
      ? await api.fs.readJSON<Partial<TSettings> | null>(settingsPath, "utf-8")
      : null;

    const systemLocale = await api.other.getLocale();
    const { lang } = normalizeSettings(
      raw,
      resolveBootstrapLanguage(systemLocale, i18n.language),
    );

    await changeAppLanguage(lang);
  } catch {}
}
