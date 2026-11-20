import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { AiProviderProfile } from "@/types/Agent";
import type { TSettings } from "@/types/Settings";
import { accountAtom } from "@renderer/stores/atoms";
import { agentBlockReason, blockReasonKey } from "@renderer/navigation/access";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { onRadioKeyDown, radioFocusIndex } from "@renderer/utilities/radioKeys";
import {
  AgentProvidersModal,
  ProviderRow,
} from "@renderer/features/agent/AgentProvidersModal";
import { useAgentProviders } from "@renderer/features/agent/useAgentProviders";
import { LockedNote, SettingRow, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";

export function AssistantSection({
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
  const account = useAtomValue(accountAtom);
  const blocked = agentBlockReason(account?.type);
  const { state, setState, loadFailed, load, select, remove } =
    useAgentProviders();
  const [editing, setEditing] = useState<"new" | AiProviderProfile | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<AiProviderProfile | null>(
    null,
  );

  const providerIds = state?.providers.map((provider) => provider.id) ?? [];
  const providerFocus = radioFocusIndex(providerIds, state?.selectedId);

  return (
    <div className="flex flex-col gap-4">
      {visible("agentProviders") && (
        <SettingsGroup
          entry="agentProviders"
          title={t("settings.assistant.providersTitle")}
          hint={t("settings.assistant.providersHint")}
        >
          {blocked && (
            <div className="px-3.5 py-2.5">
              <LockedNote reason={t(blockReasonKey(blocked))} />
            </div>
          )}

          {!state ? (
            loadFailed ? (
              <div className="flex items-center gap-3 px-3.5 py-3">
                <TriangleAlert className="size-4 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                  {t("agent.providers.loadFailed")}
                </span>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : (
              <div className="grid gap-2 px-3.5 py-3">
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            )
          ) : (
            <div className="grid gap-2 px-3.5 py-3">
              {state.providers.length > 0 && (
                <div
                  role="radiogroup"
                  aria-label={t("agent.providers.title")}
                  className="grid min-w-0 gap-2"
                  onKeyDown={(event) =>
                    onRadioKeyDown(
                      event,
                      providerIds,
                      state.selectedId,
                      (id) => void select(id),
                    )
                  }
                >
                  {state.providers.map((provider, index) => (
                    <ProviderRow
                      key={provider.id}
                      provider={provider}
                      isActive={provider.id === state.selectedId}
                      tabIndex={index === providerFocus ? 0 : -1}
                      onSelect={() => void select(provider.id)}
                      onEdit={() => setEditing(provider)}
                      onAskDelete={() => setPendingDelete(provider)}
                    />
                  ))}
                </div>
              )}

              <div className="flex min-w-0 items-center gap-3">
                <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
                  {t("settings.assistant.keysNote")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setEditing("new")}
                >
                  <Plus />
                  {t("agent.providers.add")}
                </Button>
              </div>
            </div>
          )}
        </SettingsGroup>
      )}

      {(visible("agentChatSync") || visible("aiLogAnalysis")) && (
        <SettingsGroup title={t("settings.assistant.dataTitle")}>
          {visible("agentChatSync") && (
            <SettingRow
              entry="agentChatSync"
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

          {visible("aiLogAnalysis") && (
            <SettingRow
              entry="aiLogAnalysis"
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
        </SettingsGroup>
      )}

      {editing && (
        <AgentProvidersModal
          startWith={editing}
          onSaved={setState}
          onClose={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <Confirmation
          title={t("agent.providers.deleteConfirm", {
            name: pendingDelete.label,
          })}
          onClose={() => setPendingDelete(null)}
          reversible={false}
          content={[{ text: t("agent.providers.deleteHint") }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingDelete(null),
            },
            {
              text: t("common.delete"),
              color: "danger",
              onClick: async () => {
                const id = pendingDelete.id;
                setPendingDelete(null);
                await remove(id);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
