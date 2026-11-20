import { useCallback, useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  ClipboardCopy,
  Copy,
  ExternalLink,
  FolderOpen,
  LifeBuoy,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { STATUS_URL } from "@/shared/config";
import type {
  JournalStatus,
  SupportReportHistoryItem,
} from "@/types/Journal";
import type { TSettings } from "@/types/Settings";
import { pathsAtom, versionsAtom } from "@renderer/stores/atoms";
import {
  mirrorModeAtom,
  openConnectivityCheck,
} from "@renderer/features/install/installUi";
import {
  formatReportBytes,
  openSupportReport,
  supportDialogAtom,
  supportRepliesAtom,
} from "@renderer/features/support/supportReport";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { Hint } from "@renderer/components/Hint";
import { formatRelative } from "@renderer/utilities/date";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import { buildSystemReport } from "./systemReport";
import type { SettingsEntryId } from "./catalog";

const api = window.api;

const VERBOSE_MINUTES = 24 * 60;
const HISTORY_SHOWN = 5;

export function SupportSection({
  settings,
  appVersion,
  totalMemoryMb,
  storageTotal,
  visible,
  query,
  commit,
  isChanged,
  reset,
}: {
  settings: TSettings;
  appVersion: string;
  totalMemoryMb: number;
  storageTotal: string;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
  commit: (patch: Partial<TSettings>) => void;
  isChanged: (id: SettingsEntryId) => boolean;
  reset: (id: SettingsEntryId) => void;
}) {
  const { t, i18n } = useTranslation();
  const paths = useAtomValue(pathsAtom);
  const versions = useAtomValue(versionsAtom);
  const mirrorMode = useAtomValue(mirrorModeAtom);
  const dialogRequest = useAtomValue(supportDialogAtom);
  const replies = useAtomValue(supportRepliesAtom);

  const [status, setStatus] = useState<JournalStatus | null>(null);
  const [history, setHistory] = useState<SupportReportHistoryItem[]>([]);
  const [isToggling, setToggling] = useState(false);

  const refresh = useCallback(() => {
    void api.journal.status().then(setStatus).catch(ignoreFailure);
    void api.support.history().then(setHistory).catch(ignoreFailure);
  }, []);

  useEffect(() => {
    if (!dialogRequest) refresh();
  }, [dialogRequest, refresh]);

  const verboseUntil = status?.verboseUntil ?? null;

  const toggleVerbose = async (enabled: boolean) => {
    setToggling(true);
    try {
      await api.journal.setVerbose(enabled ? VERBOSE_MINUTES : null);
    } catch (error) {
      showFailureToast(t("settings.saveFailed"), error, {
        channels: ["journal:setVerbose"],
      });
    } finally {
      setToggling(false);
      refresh();
    }
  };

  const copy = async (text: string) => {
    await copyWithFeedback(text);
  };

  const copySystemFacts = () =>
    copy(
      buildSystemReport({
        appVersion,
        platform: api.platform,
        totalMemoryMb,
        xmx: settings.xmx,
        optimizedJvm: settings.optimizedJvm,
        downloadSource: settings.downloadSource,
        mirrorMode,
        language: settings.lang,
        instanceCount: versions.length,
        launcherPath: paths.launcher,
        minecraftPath: paths.minecraft,
        javaPath: paths.java,
        storageTotal,
      }),
    );

  const verboseDescription = verboseUntil
    ? t("settings.supportSection.verboseUntil", {
        time: new Date(verboseUntil).toLocaleString(i18n.language, {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      })
    : t("settings.supportSection.verboseDescription");

  return (
    <div className="flex flex-col gap-4">
      {(visible("supportReport") ||
        visible("verboseJournal") ||
        visible("devMode")) && (
        <SettingsGroup
          title={t("settings.supportSection.reportTitle")}
          hint={t("settings.supportSection.reportHint")}
        >
          {visible("supportReport") && (
            <SettingRow
              entry="supportReport"
              title={t("settings.supportSection.send")}
              description={t("settings.supportSection.sendDescription")}
              query={query}
              control={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openSupportReport("settings")}
                >
                  <LifeBuoy className="size-3.5" />
                  {t("settings.supportSection.sendAction")}
                </Button>
              }
            />
          )}
          {visible("verboseJournal") && (
            <SettingRow
              entry="verboseJournal"
              htmlFor="settings-verbose-journal"
              title={t("settings.supportSection.verbose")}
              description={verboseDescription}
              query={query}
              control={
                <Switch
                  id="settings-verbose-journal"
                  checked={verboseUntil !== null}
                  disabled={isToggling || !status}
                  onCheckedChange={(value) => void toggleVerbose(value)}
                />
              }
            />
          )}
          {visible("devMode") && (
            <SettingRow
              entry="devMode"
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
          {visible("verboseJournal") && (
            <SettingRow
              entry="verboseJournal"
              title={t("settings.supportSection.folder")}
              description={
                status
                  ? t("settings.supportSection.folderDescription", {
                      size: formatReportBytes(status.sizeBytes),
                      files: status.files,
                    })
                  : t("settings.supportSection.folderDescriptionEmpty")
              }
              query={query}
              control={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!status?.dir}
                  onClick={() => void api.journal.openFolder()}
                >
                  <FolderOpen className="size-3.5" />
                  {t("settings.about.openLink")}
                </Button>
              }
            />
          )}
        </SettingsGroup>
      )}

      {visible("supportReport") && replies && replies.length > 0 && (
        <SettingsGroup entry="supportReport" title={t("settings.supportSection.repliesTitle")}>
          {replies.slice(0, HISTORY_SHOWN).map((item) => (
            <div key={item.code} className="grid min-w-0 gap-1.5 px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-mono text-sm tracking-wider text-foreground tabular-nums">
                  {item.code}
                </span>
                <Hint
                  content={[formatRelative(new Date(item.repliedAt)), item.instanceName]
                    .filter(Boolean)
                    .join(" · ")}
                  variant="text"
                  truncatedOnly
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-faint">
                    {[formatRelative(new Date(item.repliedAt)), item.instanceName]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Hint>
              </div>
              <p className="max-h-40 overflow-y-auto text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                {item.reply}
              </p>
            </div>
          ))}
        </SettingsGroup>
      )}

      {visible("supportReport") && history.length > 0 && (
        <SettingsGroup entry="supportReport" title={t("settings.supportSection.historyTitle")}>
          {history.slice(0, HISTORY_SHOWN).map((item) => (
            <div
              key={item.code}
              className="flex h-10 min-w-0 items-center gap-3 px-3.5"
            >
              <span className="font-mono text-sm tracking-wider text-foreground tabular-nums">
                {item.code}
              </span>
              <Hint
                content={[formatRelative(new Date(item.createdAt)), item.versionName]
                  .filter(Boolean)
                  .join(" · ")}
                variant="text"
                truncatedOnly
              >
                <span className="min-w-0 flex-1 truncate text-xs text-faint">
                  {[formatRelative(new Date(item.createdAt)), item.versionName]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Hint>
              <Hint content={t("common.copy")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-faint"
                  aria-label={t("common.copy")}
                  onClick={() => void copy(item.code)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </Hint>
            </div>
          ))}
        </SettingsGroup>
      )}

      {visible("systemReport") && (
        <SettingsGroup entry="systemReport" title={t("settings.about.supportTitle")}>
          <SettingRow
            title={t("settings.about.copyReport")}
            description={t("settings.about.copyReportDescription")}
            query={query}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copySystemFacts()}
              >
                <ClipboardCopy className="size-3.5" />
                {t("common.copy")}
              </Button>
            }
          />
          <SettingRow
            title={t("settings.connectivity.heading")}
            description={t("settings.connectivity.description")}
            query={query}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => openConnectivityCheck()}
              >
                <Wifi className="size-3.5" />
                {t("settings.connectivity.run")}
              </Button>
            }
          />
          <SettingRow
            title={t("settings.connectivity.statusPage")}
            description={t("settings.about.statusDescription")}
            query={query}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void api.shell.openExternal(STATUS_URL).catch((error) =>
                    showFailureToast(t("settings.about.openLinkFailed"), error, {
                      channels: ["shell:openExternal"],
                    }),
                  )
                }
              >
                <ExternalLink className="size-3.5" />
                {t("settings.about.openLink")}
              </Button>
            }
          />
        </SettingsGroup>
      )}
    </div>
  );
}
