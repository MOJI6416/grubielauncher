import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultCloseToTray,
  GAME_WINDOW_MODES,
  resolveCloseToTray,
  START_SCREENS,
  type GameWindowMode,
  type StartScreen,
  type TSettings,
} from "@/types/Settings";
import { showFailureToast } from "@renderer/utilities/failures";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";

const api = window.api;

export function SystemSection({
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
  const [loginItem, setLoginItem] = useState<{
    supported: boolean;
    enabled: boolean;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.system
      .getLaunchAtLogin()
      .then((state) => {
        if (!cancelled) setLoginItem(state);
      })
      .catch(() => {
        if (!cancelled) setLoginItem({ supported: false, enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeToTray = resolveCloseToTray(settings.closeToTray, api.platform);

  const toggleLaunchAtLogin = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      const next = await api.system.setLaunchAtLogin(enabled);
      setLoginItem(next);
      if (next.enabled !== enabled) throw new Error("login item was not changed");
    } catch (error) {
      showFailureToast(t("settings.system.launchAtLoginFailed"), error, {
        channels: ["system:setLaunchAtLogin"],
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsGroup title={t("settings.sections.system")}>
      {visible("closeToTray") && (
        <SettingRow
          htmlFor="settings-close-to-tray"
          title={t("settings.system.closeToTray")}
          description={t("settings.system.closeToTrayDescription")}
          query={query}
          changed={isChanged("closeToTray")}
          onReset={() => reset("closeToTray")}
          control={
            <Switch
              id="settings-close-to-tray"
              checked={closeToTray}
              onCheckedChange={(value) =>
                commit({
                  closeToTray:
                    value === defaultCloseToTray(api.platform) ? null : value,
                })
              }
            />
          }
        />
      )}

      {visible("launchAtLogin") && (
        <SettingRow
          htmlFor="settings-launch-at-login"
          title={t("settings.system.launchAtLogin")}
          description={
            loginItem && !loginItem.supported
              ? t("settings.system.launchAtLoginUnsupported")
              : t("settings.system.launchAtLoginDescription")
          }
          query={query}
          disabled={!loginItem?.supported}
          control={
            <Switch
              id="settings-launch-at-login"
              checked={loginItem?.enabled === true}
              disabled={!loginItem?.supported || isSaving}
              onCheckedChange={(value) => void toggleLaunchAtLogin(value)}
            />
          }
        />
      )}

      {visible("startScreen") && (
        <SettingRow
          title={t("settings.system.startScreen")}
          description={t("settings.system.startScreenDescription")}
          query={query}
          changed={isChanged("startScreen")}
          onReset={() => reset("startScreen")}
          control={
            <Select
              value={settings.startScreen}
              onValueChange={(value) =>
                value && commit({ startScreen: value as StartScreen })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {START_SCREENS.map((screen) => (
                  <SelectItem key={screen} value={screen}>
                    {t(`settings.system.startScreens.${screen}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      )}

      {visible("gameWindow") && (
        <SettingRow
          title={t("settings.system.gameWindow")}
          description={t("settings.system.gameWindowDescription")}
          query={query}
          changed={isChanged("gameWindow")}
          onReset={() => reset("gameWindow")}
          control={
            <Select
              value={settings.gameWindow}
              onValueChange={(value) =>
                value && commit({ gameWindow: value as GameWindowMode })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAME_WINDOW_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`settings.system.gameWindowModes.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          {settings.gameWindow !== "keep" && (
            <label
              htmlFor="settings-restore-after-game"
              className="mt-2.5 flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground"
            >
              <Switch
                id="settings-restore-after-game"
                checked={settings.restoreAfterGame}
                onCheckedChange={(value) =>
                  commit({ restoreAfterGame: value })
                }
              />
              {t("settings.system.restoreAfterGame")}
            </label>
          )}
        </SettingRow>
      )}
    </SettingsGroup>
  );
}
