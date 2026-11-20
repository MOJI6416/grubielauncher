import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Switch } from "@/components/ui/switch";
import type { BlessedPathInfo } from "@/types/AllowedPath";
import type { TSettings } from "@/types/Settings";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  setStreamerMode,
  useRedact,
  useStreamerState,
} from "@renderer/features/streamer/streamerMode";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";

const api = window.api;

export function PrivacySection({
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
  const [allowed, setAllowed] = useState<BlessedPathInfo[]>([]);
  const streamer = useStreamerState();
  const redact = useRedact();

  const load = useCallback(async () => {
    try {
      setAllowed((await api.allowedPaths.list()) ?? []);
    } catch {
      setAllowed([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (path: string) => {
    try {
      if (!(await api.allowedPaths.revoke(path))) throw new Error("revoke");
    } catch (error) {
      showFailureToast(t("settings.allowedPaths.revokeFailed"), error, {
        channels: ["safepath:revoke"],
      });
    }
    await load();
  };

  const allowedKeys = new Set(allowed.map((entry) => entry.path));

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup title={t("settings.streamer.title")}>
        {visible("streamerMode") && (
          <SettingRow
            entry="streamerMode"
            htmlFor="settings-streamer-mode"
            title={t("settings.streamer.enabled")}
            description={t("settings.streamer.enabledDescription")}
            query={query}
            changed={isChanged("streamerMode")}
            onReset={() => reset("streamerMode")}
            control={
              <Switch
                id="settings-streamer-mode"
                checked={streamer.active}
                onCheckedChange={(value) =>
                  void setStreamerMode(value, async (patch) => commit(patch))
                }
              />
            }
          >
            {streamer.app && streamer.reason !== "manual" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MonitorPlay className="size-3.5 shrink-0 text-faint" />
                {streamer.active
                  ? t("settings.streamer.autoActive", { app: streamer.app })
                  : t("settings.streamer.autoDismissed", { app: streamer.app })}
              </p>
            )}
          </SettingRow>
        )}

        {visible("streamerModeAuto") && (
          <SettingRow
            entry="streamerModeAuto"
            htmlFor="settings-streamer-auto"
            title={t("settings.streamer.auto")}
            description={t("settings.streamer.autoDescription")}
            query={query}
            changed={isChanged("streamerModeAuto")}
            onReset={() => reset("streamerModeAuto")}
            control={
              <Switch
                id="settings-streamer-auto"
                checked={settings.streamerModeAuto}
                onCheckedChange={(value) => commit({ streamerModeAuto: value })}
              />
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title={t("settings.sections.privacy")}>
        {visible("hideServerInRpc") && (
          <SettingRow
            entry="hideServerInRpc"
            htmlFor="settings-hide-server"
            title={t("settings.hideServerInRpc")}
            description={t("settings.hideServerInRpcDescription")}
            query={query}
            changed={isChanged("hideServerInRpc")}
            onReset={() => reset("hideServerInRpc")}
            control={
              <Switch
                id="settings-hide-server"
                checked={settings.hideServerInRpc}
                onCheckedChange={(value) => commit({ hideServerInRpc: value })}
              />
            }
          />
        )}

        {visible("directConnect") && (
          <SettingRow
            entry="directConnect"
            htmlFor="settings-direct-connect"
            title={t("settings.directConnect")}
            description={t("settings.directConnectDescription")}
            query={query}
            changed={isChanged("directConnect")}
            onReset={() => reset("directConnect")}
            control={
              <Switch
                id="settings-direct-connect"
                checked={settings.directConnect}
                onCheckedChange={(value) => commit({ directConnect: value })}
              />
            }
          />
        )}

        {visible("crashTelemetry") && (
          <SettingRow
            entry="crashTelemetry"
            htmlFor="settings-crash-telemetry"
            title={t("settings.crashTelemetry")}
            description={t("settings.crashTelemetryDescription")}
            query={query}
            changed={isChanged("crashTelemetry")}
            onReset={() => reset("crashTelemetry")}
            control={
              <Switch
                id="settings-crash-telemetry"
                checked={settings.crashTelemetry}
                onCheckedChange={(value) => commit({ crashTelemetry: value })}
              />
            }
          />
        )}

        {visible("usageStats") && (
          <SettingRow
            entry="usageStats"
            htmlFor="settings-usage-stats"
            title={t("settings.usageStats")}
            description={t("settings.usageStatsDescription")}
            query={query}
            changed={isChanged("usageStats")}
            onReset={() => reset("usageStats")}
            control={
              <Switch
                id="settings-usage-stats"
                checked={settings.usageStats}
                onCheckedChange={(value) => commit({ usageStats: value })}
              />
            }
          />
        )}

        {visible("packAnalytics") && (
          <SettingRow
            entry="packAnalytics"
            htmlFor="settings-pack-analytics"
            title={t("settings.packAnalytics")}
            description={t("settings.packAnalyticsDescription")}
            query={query}
            changed={isChanged("packAnalytics")}
            onReset={() => reset("packAnalytics")}
            control={
              <Switch
                id="settings-pack-analytics"
                checked={settings.packAnalytics}
                onCheckedChange={(value) => commit({ packAnalytics: value })}
              />
            }
          />
        )}

        {visible("accountSync") && (
          <SettingRow
            entry="accountSync"
            htmlFor="settings-account-sync"
            title={t("settings.accountSync")}
            description={t("settings.accountSyncDescription")}
            query={query}
            changed={isChanged("accountSync")}
            onReset={() => reset("accountSync")}
            control={
              <Switch
                id="settings-account-sync"
                checked={settings.accountSync}
                onCheckedChange={(value) => commit({ accountSync: value })}
              />
            }
          />
        )}
      </SettingsGroup>

      {visible("allowedPaths") && (
        <SettingsGroup entry="allowedPaths" title={t("settings.allowedPaths.title")}>
          <div className="px-3.5 py-2.5">
            <p className="text-xs leading-snug text-muted-foreground">
              {t("settings.allowedPaths.description")}
            </p>
          </div>

          {allowed.length === 0 ? (
            <p className="px-3.5 py-2.5 text-xs text-faint">
              {t("settings.allowedPaths.empty")}
            </p>
          ) : (
            <RemovalList sourceKeys={allowedKeys}>
              {allowed.map((entry) => (
                <RemovalItem key={entry.path} itemKey={entry.path}>
                  <div className="flex items-center gap-3 px-3.5 py-2">
                    <FolderOpen className="size-3.5 shrink-0 text-faint" />
                    <Hint
                      content={redact.path(entry.path)}
                      variant="text"
                      truncatedOnly
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                        {redact.path(entry.path)}
                      </span>
                    </Hint>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => void revoke(entry.path)}
                    >
                      {t("settings.allowedPaths.revoke")}
                    </Button>
                  </div>
                </RemovalItem>
              ))}
            </RemovalList>
          )}
        </SettingsGroup>
      )}
    </div>
  );
}
