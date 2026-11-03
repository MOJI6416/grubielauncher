import { useEffect, useState } from "react";
import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Check, ClipboardPaste, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ACCENT_IDS, ACCENTS, DEFAULT_ACCENT, isAccentId } from "@/shared/accents";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  MAX_USER_THEMES,
  findTheme,
  isThemeReadable,
  type ThemeDefinition,
} from "@/shared/themes";
import type { TSettings } from "@/types/Settings";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import { ThemeCard, themeName } from "@renderer/features/theme/ThemeCard";
import { ThemeEditor } from "@renderer/features/theme/ThemeEditor";
import { ThemeCodeDialog } from "@renderer/features/theme/ThemeCodeDialog";
import { ThemeGallery } from "@renderer/features/theme/ThemeGallery";
import { galleryFocusAtom, publishTheme } from "@renderer/features/theme/gallery";
import {
  copyThemeCode,
  exportThemeToFile,
  importThemeFromFile,
} from "@renderer/features/theme/themeTransfer";
import {
  newThemeId,
  saveUserThemes,
  themeDraftAtom,
  userThemesAtom,
} from "@renderer/features/theme/themesStore";
import { Segmented, SettingRow, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";

export function ThemeSection({
  settings,
  commit,
  visible,
  query,
  isChanged,
  reset,
}: {
  settings: TSettings;
  commit: (patch: Partial<TSettings>) => void;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
  isChanged: (id: SettingsEntryId) => boolean;
  reset: (id: SettingsEntryId) => void;
}) {
  const { t } = useTranslation();
  const userThemes = useAtomValue(userThemesAtom);
  const [draft, setDraft] = useAtom(themeDraftAtom);
  const [pendingDelete, setPendingDelete] = useState<ThemeDefinition | null>(null);
  const [pendingPublish, setPendingPublish] = useState<ThemeDefinition | null>(null);
  const [isCodeOpen, setCodeOpen] = useState(false);
  const galleryFocus = useAtomValue(galleryFocusAtom);
  const [tab, setTab] = useState<"mine" | "gallery">(galleryFocus ? "gallery" : "mine");
  const accentId = isAccentId(settings.accent) ? settings.accent : DEFAULT_ACCENT;
  const accent = ACCENTS[accentId].primary;
  const active = findTheme(settings.themeId, userThemes);
  const isEditingExisting = !!draft && userThemes.some((theme) => theme.id === draft.id);

  useEffect(() => () => getDefaultStore().set(themeDraftAtom, null), []);

  useEffect(() => {
    if (galleryFocus) setTab("gallery");
  }, [galleryFocus]);

  const startFrom = (base: ThemeDefinition, name: string) => {
    if (userThemes.length >= MAX_USER_THEMES) {
      toast.error(t("theme.limit", { count: MAX_USER_THEMES }));
      return;
    }
    setDraft({
      id: newThemeId(),
      name: name.slice(0, 40),
      mode: base.mode,
      colors: { ...base.colors },
      backdrop: base.backdrop ? { ...base.backdrop } : null,
    });
  };

  const select = (theme: ThemeDefinition) => {
    if (draft) setDraft(null);
    if (theme.id !== settings.themeId) commit({ themeId: theme.id });
  };

  const save = async () => {
    if (!draft || !draft.name.trim() || !isThemeReadable(draft, accent)) return;
    const theme = { ...draft, name: draft.name.trim() };
    const next = userThemes.some((item) => item.id === theme.id)
      ? userThemes.map((item) => (item.id === theme.id ? theme : item))
      : [...userThemes, theme];

    if (!(await saveUserThemes(next))) {
      showFailureToast(t("settings.saveFailed"), undefined, {
        channels: ["fs:writeJSON"],
      });
      return;
    }
    try {
      await patchSettings({ themeId: theme.id });
    } catch (error) {
      showFailureToast(t("settings.saveFailed"), error, { channels: ["fs:writeJSON"] });
    }
    setDraft(null);
    toast.success(t("theme.saved", { name: theme.name }));
  };

  const remove = async (theme: ThemeDefinition) => {
    setPendingDelete(null);
    if (!(await saveUserThemes(userThemes.filter((item) => item.id !== theme.id)))) {
      showFailureToast(t("settings.saveFailed"), undefined, { channels: ["fs:writeJSON"] });
      return;
    }
    if (draft?.id === theme.id) setDraft(null);
    if (settings.themeId === theme.id) {
      await patchSettings({ themeId: DEFAULT_THEME_ID }).catch(() => undefined);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup title={t("settings.sections.themes")}>
        {visible("theme") && (
          <SettingRow
            title={t("theme.title")}
            description={t("theme.description")}
            query={query}
            changed={isChanged("theme")}
            onReset={() => {
              setDraft(null);
              reset("theme");
            }}
            control={
              <Segmented
                value={tab}
                ariaLabel={t("theme.gallery.tabs")}
                onChange={(next) => {
                  if (next === "gallery") setDraft(null);
                  setTab(next);
                }}
                options={[
                  { value: "mine", label: t("theme.gallery.tabMine") },
                  { value: "gallery", label: t("theme.gallery.tab") },
                ]}
              />
            }
          >
            {tab === "gallery" ? (
              <div className="mt-2.5">
                <ThemeGallery accent={accent} activeId={active.id} userThemes={userThemes} />
              </div>
            ) : (
            <>
            <div
              role="radiogroup"
              aria-label={t("theme.title")}
              className="mt-2.5 grid grid-cols-4 gap-2"
            >
              {[...BUILT_IN_THEMES, ...userThemes].map((theme) => {
                const isBuiltIn = BUILT_IN_THEMES.includes(theme);
                return (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    accent={accent}
                    active={draft ? draft.id === theme.id : active.id === theme.id}
                    isBuiltIn={isBuiltIn}
                    onSelect={() => select(theme)}
                    onEdit={() => setDraft({ ...theme, colors: { ...theme.colors } })}
                    onDuplicate={() =>
                      startFrom(theme, t("theme.copyName", { name: themeName(theme, t) }))
                    }
                    onDelete={() => setPendingDelete(theme)}
                    onExport={() => void exportThemeToFile(theme)}
                    onCopyCode={() => void copyThemeCode(theme)}
                    onPublish={() => setPendingPublish(theme)}
                  />
                );
              })}
              <button
                type="button"
                onClick={() => startFrom(active, t("theme.newName"))}
                className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Plus className="size-4" />
                {t("theme.newTheme")}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(null);
                  void importThemeFromFile();
                }}
              >
                <FolderOpen />
                {t("theme.transfer.openFile")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(null);
                  setCodeOpen(true);
                }}
              >
                <ClipboardPaste />
                {t("theme.transfer.pasteCode")}
              </Button>
              <span className="text-xs text-faint">{t("theme.transfer.dropHint")}</span>
            </div>
            </>
            )}
          </SettingRow>
        )}

        {visible("accent") && (
          <SettingRow
            title={t("settings.interface.accent")}
            description={
              active.colors.accent
                ? t("theme.accentByTheme", { name: themeName(active, t) })
                : t("settings.interface.accentDescription")
            }
            query={query}
            changed={isChanged("accent")}
            onReset={() => reset("accent")}
            control={
              <div
                role="radiogroup"
                aria-label={t("settings.interface.accent")}
                className="flex items-center gap-1.5"
              >
                {ACCENT_IDS.map((id) => {
                  const isActive = settings.accent === id;
                  return (
                    <Hint key={id} content={t(`settings.interface.accents.${id}`)}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={t(`settings.interface.accents.${id}`)}
                        onClick={() => commit({ accent: id })}
                        style={{ backgroundColor: ACCENTS[id].primary }}
                        className="flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface-2 transition-shadow hover:ring-2 hover:ring-border aria-checked:ring-2 aria-checked:ring-foreground/70 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
                      >
                        {isActive && (
                          <Check
                            className="size-3.5"
                            style={{ color: ACCENTS[id].foreground }}
                          />
                        )}
                      </button>
                    </Hint>
                  );
                })}
              </div>
            }
          />
        )}
      </SettingsGroup>

      {draft && (
        <ThemeEditor
          draft={draft}
          accent={accent}
          isNew={!isEditingExisting}
          onChange={setDraft}
          onSave={() => void save()}
          onCancel={() => setDraft(null)}
          onDelete={() => setPendingDelete(draft)}
        />
      )}

      {isCodeOpen && <ThemeCodeDialog onClose={() => setCodeOpen(false)} />}

      {pendingPublish && (
        <Confirmation
          title={t("theme.gallery.publishTitle", { name: pendingPublish.name })}
          onClose={() => setPendingPublish(null)}
          content={[
            { text: t("theme.gallery.publishBody") },
            ...(pendingPublish.backdrop ? [{ text: t("theme.gallery.publishPicture") }] : []),
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingPublish(null),
            },
            {
              text: t("theme.gallery.publishAction"),
              onClick: async () => {
                await publishTheme(pendingPublish);
                setPendingPublish(null);
              },
            },
          ]}
        />
      )}

      {pendingDelete && (
        <Confirmation
          title={t("theme.delete")}
          onClose={() => setPendingDelete(null)}
          reversible={false}
          content={[{ text: t("theme.deleteConfirm", { name: pendingDelete.name }) }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingDelete(null),
            },
            {
              text: t("common.delete"),
              color: "danger",
              onClick: () => void remove(pendingDelete),
            },
          ]}
        />
      )}
    </div>
  );
}
