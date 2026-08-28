import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, ChevronRight, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Switch } from "@/components/ui/switch";
import type { BlessedPathInfo } from "@/types/AllowedPath";
import type { TSettings } from "@/types/Settings";
import { navigate } from "@renderer/navigation/navigate";
import { OWN_PROFILE_ID } from "@renderer/features/profile/loadProfileUser";
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

  return (
    <div className="flex flex-col gap-4">
      {visible("notifications") && (
        <SettingsGroup title={t("settings.notifications.title")}>
          <button
            type="button"
            onClick={() =>
              navigate({ name: "profile", userId: OWN_PROFILE_ID })
            }
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-3"
          >
            <Bell className="size-3.5 shrink-0 text-faint" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm text-foreground">
                {t("settings.notifications.telegram")}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {t("settings.notifications.telegramDescription")}
              </span>
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

        {visible("devMode") && (
          <SettingRow
            htmlFor="settings-dev-mode"
            title={t("settings.devMode")}
            description={t("settings.devModeDescription")}
            query={query}
            changed={isChanged("devMode")}
            onReset={() => reset("devMode")}
            control={
              <Switch
                id="settings-dev-mode"
                checked={settings.devMode}
                onCheckedChange={(value) => commit({ devMode: value })}
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
            allowed.map((entry) => (
              <div
                key={entry.path}
                className="flex items-center gap-3 px-3.5 py-2"
              >
                <FolderOpen className="size-3.5 shrink-0 text-faint" />
                <Hint content={entry.path} variant="text" truncatedOnly>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {entry.path}
                  </span>
                </Hint>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={async () => {
                    await api.allowedPaths.revoke(entry.path);
                    await load();
                  }}
                >
                  {t("settings.allowedPaths.revoke")}
                </Button>
              </div>
            ))
          )}
        </SettingsGroup>
      )}
    </div>
  );
}
