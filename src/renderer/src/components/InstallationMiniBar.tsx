import { DownloaderInfo } from "@/types/Downloader";
import { VersionInstallProgress } from "@/types/InstallationProgress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Loader2,
  Maximize2,
  Pause,
  Play,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export function InstallationMiniBar({
  info,
  downloadInfo,
  isPaused = false,
  isCancelling = false,
  onExpand,
  onTogglePause,
  onCancel,
}: {
  info: VersionInstallProgress;
  downloadInfo: DownloaderInfo | null;
  isPaused?: boolean;
  isCancelling?: boolean;
  onExpand: () => void;
  onTogglePause?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();

  const title =
    info.operation === "integrity"
      ? t("installationProgress.integrityTitle")
      : info.operation === "server"
        ? t("installationProgress.serverTitle")
        : t("installationProgress.title");
  const isDone = info.stage === "done";
  const canCancel =
    !isDone &&
    (info.operation === "install" || info.operation === "integrity");
  const progressValue = info.isIndeterminate
    ? 100
    : Math.max(0, Math.min(100, info.progressPercent));

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
          {isDone ? (
            <CheckCircle2 className="size-4" />
          ) : isPaused ? (
            <Pause className="size-4" />
          ) : (
            <Loader2 className="size-4 animate-spin" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {isPaused && !isDone ? t("installationProgress.paused") : title}
          </p>
          <p
            className="truncate text-xs text-muted-foreground"
            title={info.versionName}
          >
            {downloadInfo
              ? `${downloadInfo.completedItems}/${downloadInfo.totalItems} · ${info.versionName}`
              : info.versionName}
          </p>
        </div>

        <Badge
          variant="outline"
          className="shrink-0 bg-muted/40 tabular-nums"
        >
          {info.progressPercent}%
        </Badge>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          onClick={onExpand}
          aria-label={t("installationProgress.expand")}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>

      <Progress
        value={progressValue}
        max={100}
        className={`h-1 rounded-none ${
          info.isIndeterminate && !isPaused
            ? "[&_[data-slot=progress-indicator]]:animate-pulse"
            : ""
        }`}
      />

      {canCancel ? (
        <div className="flex items-center justify-end gap-2 px-3 py-2">
          {onTogglePause ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={onTogglePause}
              disabled={isCancelling}
            >
              {isPaused ? (
                <Play className="size-3.5" />
              ) : (
                <Pause className="size-3.5" />
              )}
              {isPaused
                ? t("installationProgress.resume")
                : t("installationProgress.pause")}
            </Button>
          ) : null}

          {onCancel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={onCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              {t("common.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
