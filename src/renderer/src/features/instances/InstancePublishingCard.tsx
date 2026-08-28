import { useTranslation } from "react-i18next";
import { CloudCog, CloudDownload, Loader2, ServerCog, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { SectionCard } from "./SectionCard";

export function InstancePublishingCard({
  flags,
  shareBlockedReason,
  serverBlockedReason,
  canShare,
  canManageShare,
  canSync,
  canInstallServer,
  hasServer,
  isCheckingDiff,
  isSyncing,
  isInstallingServer,
  onShare,
  onManageShare,
  onSync,
  onInstallServer,
}: {
  flags: {
    showShareAction: boolean;
    showShareManagementAction: boolean;
    showPublishActions: boolean;
    showSyncAction: boolean;
    showServerManagerAction: boolean;
  };
  shareBlockedReason?: string;
  serverBlockedReason?: string;
  canShare: boolean;
  canManageShare: boolean;
  canSync: boolean;
  canInstallServer: boolean;
  hasServer: boolean;
  isCheckingDiff: boolean;
  isSyncing: boolean;
  isInstallingServer: boolean;
  onShare: () => void;
  onManageShare: () => void;
  onSync: () => void;
  onInstallServer: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SectionCard
      title={t("versions.sections.publishing")}
      icon={Share2}
      className="shrink-0"
      bodyClassName="grid gap-1.5 p-2"
    >
      {flags.showShareAction && (
        <Hint content={shareBlockedReason}>
          <Button
            type="button"
            variant="secondary"
            disabled={!canShare}
            onClick={onShare}
          >
            <Share2 />
            {t("versions.share")}
          </Button>
        </Hint>
      )}

      {(flags.showShareManagementAction || flags.showPublishActions) && (
        <Hint content={shareBlockedReason}>
          <Button
            type="button"
            variant="secondary"
            disabled={!canManageShare}
            onClick={onManageShare}
          >
            {isCheckingDiff ? <Loader2 className="animate-spin" /> : <CloudCog />}
            {flags.showPublishActions
              ? t("versions.publish")
              : t("versions.shareOptions")}
          </Button>
        </Hint>
      )}

      {flags.showSyncAction && (
        <Hint content={t("versions.synchronizeDescription")}>
          <Button
            type="button"
            variant="secondary"
            disabled={!canSync}
            onClick={onSync}
          >
            {isSyncing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CloudDownload />
            )}
            {t("versions.synchronize")}
          </Button>
        </Hint>
      )}

      {flags.showServerManagerAction && (
        <Hint content={serverBlockedReason}>
          <Button
            type="button"
            variant="secondary"
            disabled={!canInstallServer}
            onClick={onInstallServer}
          >
            {isInstallingServer ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ServerCog />
            )}
            {hasServer ? t("shell.tabs.server") : t("versions.serverInstall")}
          </Button>
        </Hint>
      )}
    </SectionCard>
  );
}
