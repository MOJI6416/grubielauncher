import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, ChevronRight, FolderOpen, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Switch } from "@/components/ui/switch";
import type { BlessedPathInfo } from "@/types/AllowedPath";
import type { TSettings } from "@/types/Settings";
import { navigate } from "@renderer/navigation/navigate";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { showFailureToast } from "@renderer/utilities/failures";
import { OWN_PROFILE_ID } from "@renderer/features/profile/loadProfileUser";
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

      {visible("notifications") && (
        <SettingsGroup title={t("settings.notifications.title")}>
          <button
            type="button"
            onClick={() =>
              navigate({ name: "profile", userId: OWN_PROFILE_ID })
            }
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-row-hover"
          >
            <Bell className="size-3.5 shrink-0 text-faint" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <Hint
                content={t("settings.notifications.telegram")}
                variant="text"
                truncatedOnly
              >
                <span className="truncate text-sm text-foreground">
                  {t("settings.notifications.telegram")}
                </span>
              </Hint>
              <Hint
                content={t("settings.notifications.telegramDescription")}
                variant="text"
                truncatedOnly
              >
                <span className="truncate text-xs text-muted-foreground">
                  {t("settings.notifications.telegramDescription")}
                </span>
              </Hint>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {t("settings.notifications.openProfile")}
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-faint" />
          </button>
        </SettingsGroup>
      )}

      <SettingsGroup title={t("settings.sections.privacy")}>
        {visible("hideServerInRpc") && (
          <SettingRow
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

        {visible("aiLogAnalysis") && (
          <SettingRow
            htmlFor="settings-ai-log"
            title={t("settings.aiLogAnalysis")}
            description={t("settings.aiLogAnalysisDescription")}
            query={query}
            changed={isChanged("aiLogAnalysis")}
            onReset={() => reset("aiLogAnalysis")}
            control={
              <Switch
                id="settings-ai-log"
                checked={settings.aiLogAnalysis}
                onCheckedChange={(value) => commit({ aiLogAnalysis: value })}
              />
            }
          />
        )}

        {visible("agentChatSync") && (
          <SettingRow
            htmlFor="settings-agent-chat-sync"
            title={t("settings.agentChatSync")}
            description={t("settings.agentChatSyncDescription")}
            query={query}
            changed={isChanged("agentChatSync")}
            onReset={() => reset("agentChatSync")}
            control={
              <Switch
                id="settings-agent-chat-sync"
                checked={settings.agentChatSync}
                onCheckedChange={(value) => commit({ agentChatSync: value })}
              />
            }
          />
        )}
      </SettingsGroup>

      {visible("allowedPaths") && (
        <SettingsGroup title={t("settings.allowedPaths.title")}>
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
