import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactCountryFlag from "react-country-flag";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LANGUAGES,
  LOG_FONT_SIZES,
  MOTION_SETTINGS,
  type MotionSetting,
  type TSettings,
} from "@/types/Settings";
import { formatUiScale, UI_SCALES, type UiScaleOption } from "@/shared/uiScale";
import { SettingRow, SettingsGroup, Segmented } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";
import { SHORTCUT_GROUPS, shortcutKey } from "./shortcuts";
import {
  eventDate,
  eventRange,
  formatMonthDay,
} from "@renderer/features/seasonal/calendar";
import { previewSound } from "@renderer/utilities/sounds";

const api = window.api;

function useUiScaleOptions(): UiScaleOption[] {
  const [options, setOptions] = useState<UiScaleOption[]>(() =>
    UI_SCALES.map((value) => ({ value, fits: true })),
  );

  useEffect(() => {
    let isActive = true;
    void api.other.getUiScale().then((state) => {
      if (isActive) setOptions(state.options);
    });
    return () => {
      isActive = false;
    };
  }, []);

  return options;
}

function halloweenRange(language: string): { start: string; end: string } {
  const range = eventRange("halloween");
  if (!range) return { start: "", end: "" };
  const year = new Date().getFullYear();
  return {
    start: formatMonthDay(eventDate(range.start, year), language),
    end: formatMonthDay(eventDate(range.end, year), language),
  };
}

function Keys({ combos }: { combos: string[][] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {combos.map((combo, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <span className="px-0.5 text-faint">/</span>}
          {combo.map((key) => (
            <kbd
              key={key}
              className="min-w-6 rounded-md border border-border bg-surface-3 px-1.5 py-0.5 text-center font-mono text-[0.65rem] leading-4 text-muted-foreground"
            >
              {key}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

function VolumeSlider({
  value,
  label,
  onCommit,
}: {
  value: number;
  label: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <div className="mt-2.5 flex items-center gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <Slider
        min={0}
        max={100}
        step={5}
        value={[draft]}
        onValueChange={([next]) => {
          if (typeof next === "number") setDraft(next);
        }}
        onValueCommit={([next]) => {
          if (typeof next !== "number") return;
          onCommit(next);
          previewSound(next);
        }}
        aria-label={label}
        className="flex-1"
      />
      <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
        {draft}%
      </span>
    </div>
  );
}

export function InterfaceSection({
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
  const { t, i18n } = useTranslation();
  const selected = LANGUAGES.find((item) => item.code === settings.lang);
  const scaleOptions = useUiScaleOptions();
  const fittingScales = scaleOptions.filter((option) => option.fits);
  const largestFitting = fittingScales.at(-1);
  const isScaleLimited = fittingScales.length < scaleOptions.length;
  const shownScale =
    fittingScales.find((option) => option.value === settings.uiScale)?.value ??
    largestFitting?.value ??
    settings.uiScale;

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup title={t("settings.sections.interface")}>
        {visible("language") && (
          <SettingRow
            title={t("settings.language")}
            description={t("settings.interface.languageDescription")}
            query={query}
            changed={isChanged("language")}
            onReset={() => reset("language")}
            control={
              <Select
                value={settings.lang}
                onValueChange={(value) => value && commit({ lang: value })}
              >
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {selected && (
                      <span className="flex min-w-0 items-center gap-2">
                        <ReactCountryFlag svg countryCode={selected.country} />
                        <span className="truncate">{selected.label}</span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      <span className="flex items-center gap-2">
                        <ReactCountryFlag svg countryCode={item.country} />
                        {item.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        )}

        {visible("uiScale") && (
          <SettingRow
            title={t("settings.interface.uiScale")}
            description={t("settings.interface.uiScaleDescription")}
            query={query}
            changed={isChanged("uiScale")}
            onReset={() => reset("uiScale")}
            control={
              <Segmented<string>
                ariaLabel={t("settings.interface.uiScale")}
                value={String(shownScale)}
                onChange={(value) => commit({ uiScale: Number(value) })}
                options={scaleOptions.map((option) => ({
                  value: String(option.value),
                  label: formatUiScale(option.value),
                  disabled: !option.fits,
                }))}
              />
            }
          >
            {isScaleLimited && largestFitting && (
              <p className="mt-1.5 text-xs text-faint">
                {t("settings.interface.uiScaleLimited", {
                  value: formatUiScale(largestFitting.value),
                })}
              </p>
            )}
          </SettingRow>
        )}

        {visible("highContrast") && (
          <SettingRow
            htmlFor="settings-highContrast"
            title={t("settings.interface.highContrast")}
            description={t("settings.interface.highContrastDescription")}
            query={query}
            changed={isChanged("highContrast")}
            onReset={() => reset("highContrast")}
            control={
              <Switch
                id="settings-highContrast"
                checked={settings.highContrast}
                onCheckedChange={(value) => commit({ highContrast: value })}
              />
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title={t("settings.interface.groups.effects")}>
        {visible("motion") && (
          <SettingRow
            title={t("settings.interface.motion")}
            description={t("settings.interface.motionDescription")}
            query={query}
            changed={isChanged("motion")}
            onReset={() => reset("motion")}
            control={
              <Segmented<MotionSetting>
                ariaLabel={t("settings.interface.motion")}
                value={settings.motion}
                onChange={(value) => commit({ motion: value })}
                options={MOTION_SETTINGS.map((value) => ({
                  value,
                  label: t(`settings.interface.motionModes.${value}`),
                }))}
              />
            }
          />
        )}

        {visible("ambientTint") && (
          <SettingRow
            htmlFor="settings-ambientTint"
            title={t("settings.interface.ambientTint")}
            description={t("settings.interface.ambientTintDescription")}
            query={query}
            changed={isChanged("ambientTint")}
            onReset={() => reset("ambientTint")}
            control={
              <Switch
                id="settings-ambientTint"
                checked={settings.ambientTint}
                onCheckedChange={(value) => commit({ ambientTint: value })}
              />
            }
          />
        )}

        {visible("backgroundGrain") && (
          <SettingRow
            htmlFor="settings-backgroundGrain"
            title={t("settings.interface.backgroundGrain")}
            description={t("settings.interface.backgroundGrainDescription")}
            query={query}
            changed={isChanged("backgroundGrain")}
            onReset={() => reset("backgroundGrain")}
            control={
              <Switch
                id="settings-backgroundGrain"
                checked={settings.backgroundGrain}
                onCheckedChange={(value) => commit({ backgroundGrain: value })}
              />
            }
          />
        )}

        {visible("seasonalDecor") && (
          <SettingRow
            htmlFor="settings-seasonal-decor"
            title={t("settings.interface.seasonalDecor")}
            description={t(
              "settings.interface.seasonalDecorDescription",
              halloweenRange(i18n.language),
            )}
            query={query}
            changed={isChanged("seasonalDecor")}
            onReset={() => reset("seasonalDecor")}
            control={
              <Switch
                id="settings-seasonal-decor"
                checked={settings.seasonalDecor}
                onCheckedChange={(value) => commit({ seasonalDecor: value })}
              />
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title={t("settings.interface.groups.soundAndLogs")}>
        {visible("sounds") && (
          <SettingRow
            htmlFor="settings-sounds"
            title={t("settings.sounds")}
            description={t("settings.soundsDescription")}
            query={query}
            changed={isChanged("sounds")}
            onReset={() => reset("sounds")}
            control={
              <Switch
                id="settings-sounds"
                checked={settings.sounds}
                onCheckedChange={(value) => commit({ sounds: value })}
              />
            }
          >
            {settings.sounds && (
              <VolumeSlider
                value={settings.soundVolume}
                label={t("settings.interface.soundVolume")}
                onCommit={(value) => commit({ soundVolume: value })}
              />
            )}
          </SettingRow>
        )}

        {visible("logFontSize") && (
          <SettingRow
            title={t("settings.interface.logFontSize")}
            description={t("settings.interface.logFontSizeDescription")}
            query={query}
            changed={isChanged("logFontSize")}
            onReset={() => reset("logFontSize")}
            control={
              <Segmented<string>
                ariaLabel={t("settings.interface.logFontSize")}
                value={String(settings.logFontSize)}
                onChange={(value) => commit({ logFontSize: Number(value) })}
                options={LOG_FONT_SIZES.map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
              />
            }
          />
        )}
      </SettingsGroup>

      {visible("shortcuts") && (
        <>
          {SHORTCUT_GROUPS.map((group) => (
            <SettingsGroup
              key={group.id}
              title={t(`settings.interface.shortcutGroups.${group.id}`)}
              hint={
                group.id === "global"
                  ? t("settings.interface.shortcutsHint")
                  : undefined
              }
            >
              {group.items.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center gap-3 px-3.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {t(
                      `settings.interface.shortcuts.${shortcutKey(group.id, shortcut.id)}`,
                    )}
                  </span>
                  <Keys combos={shortcut.combos} />
                </div>
              ))}
            </SettingsGroup>
          ))}

          <SettingsGroup title={t("settings.interface.shortcutGroups.voice")}>
            <div className="flex items-center gap-3 px-3.5 py-1.5">
              <span className="min-w-0 flex-1 text-sm text-foreground">
                {t("settings.interface.shortcuts.voice.ptt")}
              </span>
              {settings.voicePtt && settings.voicePttBind ? (
                <Keys combos={[[settings.voicePttBind.label]]} />
              ) : (
                <span className="shrink-0 text-xs text-faint">
                  {t("settings.interface.shortcutVoiceOff")}
                </span>
              )}
            </div>
          </SettingsGroup>
        </>
      )}
    </div>
  );
}
