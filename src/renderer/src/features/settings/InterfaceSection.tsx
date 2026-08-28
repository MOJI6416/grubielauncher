import { useTranslation } from "react-i18next";
import ReactCountryFlag from "react-country-flag";
import { LayoutGrid, Rows3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LANGUAGES,
  type InstancesSort,
  type InstancesView,
  type TSettings,
} from "@/types/Settings";
import { SettingRow, SettingsGroup, Segmented } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";
import { SHORTCUT_GROUPS, shortcutKey } from "./shortcuts";

const SORTS: InstancesSort[] = ["activity", "playtime", "name", "manual"];

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
  const { t } = useTranslation();
  const selected = LANGUAGES.find((item) => item.code === settings.lang);

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

      {visible("instancesView") && (
        <SettingRow
          title={t("settings.interface.instancesView")}
          description={t("settings.interface.instancesViewDescription")}
          query={query}
          changed={isChanged("instancesView")}
          onReset={() => reset("instancesView")}
          control={
            <div className="flex items-center gap-2">
              <Select
                value={settings.instancesSort}
                onValueChange={(value) =>
                  value && commit({ instancesSort: value as InstancesSort })
                }
              >
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((sort) => (
                    <SelectItem key={sort} value={sort}>
                      {t(`settings.interface.sorts.${sort}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Segmented<InstancesView>
                ariaLabel={t("settings.interface.instancesView")}
                value={settings.instancesView}
                onChange={(value) => commit({ instancesView: value })}
                options={[
                  {
                    value: "list",
                    label: t("settings.interface.viewList"),
                    icon: <Rows3 className="size-3.5" />,
                  },
                  {
                    value: "grid",
                    label: t("settings.interface.viewGrid"),
                    icon: <LayoutGrid className="size-3.5" />,
                  },
                ]}
              />
            </div>
          }
        />
      )}

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
