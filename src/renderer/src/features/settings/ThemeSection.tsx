import { useEffect, useState } from "react";
import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Check, ClipboardPaste, FolderOpen, Pencil, Plus } from "lucide-react";
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
import { showUndoToast } from "@renderer/utilities/undoToast";
import { onRadioKeyDown, radioFocusIndex } from "@renderer/utilities/radioKeys";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { registerNavigationBlocker } from "@renderer/navigation/guards";
import { pendingNavigationAtom } from "@renderer/navigation/store";
import {
  cancelPendingNavigation,
  confirmPendingNavigation,
} from "@renderer/navigation/navigate";
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
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";
import { countFeature } from "@renderer/features/usage/usage";

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
  const [pendingPublish, setPendingPublish] = useState<ThemeDefinition | null>(null);
  const [isCodeOpen, setCodeOpen] = useState(false);
  const galleryFocus = useAtomValue(galleryFocusAtom);
  const [tab, setTab] = useState<"mine" | "gallery">(galleryFocus ? "gallery" : "mine");
  const accentId = isAccentId(settings.accent) ? settings.accent : DEFAULT_ACCENT;
  const accent = ACCENTS[accentId].primary;
  const active = findTheme(settings.themeId, userThemes);
  const shown = draft ?? active;
  const savedDraft = draft ? userThemes.find((theme) => theme.id === draft.id) : undefined;
  const isEditingExisting = !!savedDraft;
  const isDraftDirty =
    !!draft && (!savedDraft || JSON.stringify(savedDraft) !== JSON.stringify(draft));
  const pendingNavigation = useAtomValue(pendingNavigationAtom);
  const allThemes = [...BUILT_IN_THEMES, ...userThemes];
  const accentFocus = radioFocusIndex(ACCENT_IDS, accentId);
  const checkedId = draft ? draft.id : active.id;
  const themeFocus = radioFocusIndex(
    allThemes.map((theme) => theme.id),
    checkedId,
  );

  useEffect(() => () => getDefaultStore().set(themeDraftAtom, null), []);

  useEffect(
    () =>
      registerNavigationBlocker(
        "theme-draft",
        (target) =>
          isDraftDirty && !(target?.name === "settings" && target.section === "themes"),
      ),
    [isDraftDirty],
  );

  useEffect(() => {
    if (galleryFocus) setTab("gallery");
  }, [galleryFocus]);

  const startFrom = (base: ThemeDefinition, name: string) => {
    if (userThemes.length >= MAX_USER_THEMES) {
      toast.error(t("theme.limit", { count: MAX_USER_THEMES }));
      return;
    }
    countFeature("theme.create");
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
    if (theme.id !== settings.themeId) {
      countFeature("theme.select");
      commit({ themeId: theme.id });
    }
  };

  const save = async () => {
    if (!draft || !draft.name.trim() || !isThemeReadable(draft, accent)) return;
    countFeature("theme.save");
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

  const setThemeId = async (themeId: string) => {
    try {
      await patchSettings({ themeId });
    } catch (error) {
      showFailureToast(t("settings.saveFailed"), error, { channels: ["fs:writeJSON"] });
    }
  };

  const remove = async (id: string) => {
    const index = userThemes.findIndex((item) => item.id === id);
    const theme = userThemes[index];
    if (!theme) return;
    const wasActive = settings.themeId === theme.id;

    if (!(await saveUserThemes(userThemes.filter((item) => item.id !== theme.id)))) {
      showFailureToast(t("settings.saveFailed"), undefined, { channels: ["fs:writeJSON"] });
      return;
    }
    if (draft?.id === theme.id) setDraft(null);
    if (wasActive) await setThemeId(DEFAULT_THEME_ID);

    showUndoToast(t("theme.deleted", { name: theme.name }), async () => {
      const current = getDefaultStore().get(userThemesAtom);
      const restored = [...current];
      restored.splice(Math.min(index, restored.length), 0, theme);
      if (!(await saveUserThemes(restored))) {
        showFailureToast(t("settings.saveFailed"), undefined, { channels: ["fs:writeJSON"] });
        return;
      }
      if (wasActive) await setThemeId(theme.id);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup title={t("settings.sections.themes")}>
        {visible("theme") && (
          <SettingRow
            entry="theme accent"
            title={t("theme.title")}
            description={t("theme.description")}
            query={query}
            changed={isChanged("theme")}
            onReset={() => {
              setDraft(null);
              reset("theme");
            }}
            control={
              <SegmentedControl
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
              onKeyDown={(event) =>
                onRadioKeyDown(event, allThemes, allThemes.find((theme) => theme.id === checkedId), select)
              }
              className="mt-2.5 grid grid-cols-4 gap-2"
            >
              {allThemes.map((theme, index) => {
                const isBuiltIn = BUILT_IN_THEMES.includes(theme);
                return (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    accent={accent}
                    active={checkedId === theme.id}
                    isBuiltIn={isBuiltIn}
                    tabIndex={index === themeFocus ? 0 : -1}
                    onSelect={() => select(theme)}
                    onEdit={() => setDraft({ ...theme, colors: { ...theme.colors } })}
                    onDuplicate={() =>
                      startFrom(theme, t("theme.copyName", { name: themeName(theme, t) }))
                    }
                    onDelete={() => void remove(theme.id)}
                    onExport={() => void exportThemeToFile(theme)}
                    onCopyCode={() => void copyThemeCode(theme)}
                    onPublish={() => setPendingPublish(theme)}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => startFrom(active, t("theme.newName"))}
              >
                <Plus />
                {t("theme.newTheme")}
              </Button>
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

        {visible("accent") && (tab === "mine" || !!query) && (
          <SettingRow
            entry="accent"
            title={t("settings.interface.accent")}
            description={
              shown.colors.accent
                ? t("theme.accentByTheme", { name: draft ? draft.name : themeName(active, t) })
                : t("settings.interface.accentDescription")
            }
            query={query}
            changed={isChanged("accent")}
            onReset={() => reset("accent")}
            control={
              shown.colors.accent ? (
                <div className="flex items-center gap-2">
                  {!draft && !BUILT_IN_THEMES.includes(active) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTab("mine");
                        setDraft({ ...active, colors: { ...active.colors } });
                      }}
                    >
                      <Pencil />
                      {t("theme.edit")}
                    </Button>
                  )}
                  <Hint content={t("theme.card.ownAccent")}>
                    <span
                      role="img"
                      aria-label={t("theme.card.ownAccent")}
                      className="size-4 shrink-0 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: shown.colors.accent }}
                    />
                  </Hint>
                </div>
              ) : (
              <div
                role="radiogroup"
                aria-label={t("settings.interface.accent")}
                onKeyDown={(event) =>
                  onRadioKeyDown(event, ACCENT_IDS, accentId, (id) =>
                    commit({ accent: id }),
                  )
                }
                className="flex items-center gap-1.5"
              >
                {ACCENT_IDS.map((id, index) => {
                  const isActive = settings.accent === id;
                  return (
                    <Hint key={id} content={t(`settings.interface.accents.${id}`)}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={index === accentFocus ? 0 : -1}
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
              )
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
          onDelete={() => void remove(draft.id)}
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

      {pendingNavigation && isDraftDirty && draft && (
        <Confirmation
          title={t("versions.notSavedAsk")}
          onClose={cancelPendingNavigation}
          reversible={false}
          content={[
            {
              text: t("theme.unsavedHint", { name: draft.name.trim() || t("theme.newName") }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("versions.willReturn"),
              color: "secondary",
              onClick: cancelPendingNavigation,
            },
            {
              text: t("versions.discardChanges"),
              color: "danger",
              onClick: () => {
                setDraft(null);
                confirmPendingNavigation();
              },
            },
          ]}
        />
      )}
    </div>
  );
}
