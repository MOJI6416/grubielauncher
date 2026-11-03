import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { ACCENTS, DEFAULT_ACCENT, isAccentId } from "@/shared/accents";
import {
  MAX_USER_THEMES,
  isThemeReadable,
  type ThemeDefinition,
} from "@/shared/themes";
import {
  decodeThemeCode,
  encodeThemeCode,
  themeFromManifest,
  themeManifest,
} from "@/shared/themeFile";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import { copyToClipboard } from "@renderer/utilities/clipboard";
import { newThemeId, saveUserThemes, userThemesAtom } from "./themesStore";

const api = window.api;

function currentAccent(): string {
  const accent = getDefaultStore().get(settingsAtom).accent;
  return ACCENTS[isAccentId(accent) ? accent : DEFAULT_ACCENT].primary;
}

export async function addTheme(theme: ThemeDefinition): Promise<boolean> {
  const store = getDefaultStore();
  const themes = store.get(userThemesAtom);

  if (themes.length >= MAX_USER_THEMES) {
    toast.error(i18n.t("theme.limit", { count: MAX_USER_THEMES }));
    return false;
  }
  if (!isThemeReadable(theme, currentAccent())) {
    toast.error(i18n.t("theme.transfer.unreadable"));
    return false;
  }
  if (!(await saveUserThemes([...themes, theme]))) {
    showFailureToast(i18n.t("settings.saveFailed"), undefined, {
      channels: ["fs:writeJSON"],
    });
    return false;
  }

  await patchSettings({ themeId: theme.id }).catch(() => undefined);
  toast.success(i18n.t("theme.transfer.imported", { name: theme.name }));
  return true;
}

export async function importThemeFromFile(sourcePath?: string): Promise<boolean> {
  try {
    const result = await api.theme.importFile(sourcePath);
    if (!result) {
      if (sourcePath) toast.error(i18n.t("theme.transfer.badFile"));
      return false;
    }
    const theme = themeFromManifest(result.manifest, newThemeId(), result.backdropPath);
    if (!theme) {
      toast.error(i18n.t("theme.transfer.badFile"));
      return false;
    }
    return await addTheme(theme);
  } catch (error) {
    showFailureToast(i18n.t("theme.transfer.badFile"), error, {
      channels: ["theme:import"],
    });
    return false;
  }
}

export async function importThemeFromCode(text: string): Promise<boolean> {
  const theme = decodeThemeCode(text, newThemeId());
  if (!theme) {
    toast.error(i18n.t("theme.transfer.badCode"));
    return false;
  }
  return await addTheme(theme);
}

export async function exportThemeToFile(theme: ThemeDefinition): Promise<void> {
  try {
    const result = await api.theme.exportFile(
      themeManifest(theme),
      theme.backdrop?.path ?? null,
    );
    if (result === "saved") toast.success(i18n.t("theme.transfer.exported", { name: theme.name }));
    if (result === "failed") toast.error(i18n.t("theme.transfer.exportFailed"));
  } catch (error) {
    showFailureToast(i18n.t("theme.transfer.exportFailed"), error, {
      channels: ["theme:export"],
    });
  }
}

export async function copyThemeCode(theme: ThemeDefinition): Promise<void> {
  if (!(await copyToClipboard(encodeThemeCode(theme)))) return;
  toast.success(i18n.t("theme.transfer.codeCopied"), {
    description: theme.backdrop ? i18n.t("theme.transfer.codeNoPicture") : undefined,
  });
}
