import { DownloaderInfo } from "@/types/Downloader";
import { VersionInstallProgress } from "@/types/InstallationProgress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@renderer/utilities/file";
import {
  CheckCircle2,
  Cpu,
  Download,
  Loader2,
  Minimize2,
  PackageCheck,
  Pause,
  Play,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export function InstallationProgress({
  info,
  downloadInfo,
  onCancel,
  isCancelling = false,
  onMinimize,
  isPaused = false,
  onTogglePause,
}: {
  info: VersionInstallProgress;
  downloadInfo: DownloaderInfo | null;
  onCancel?: () => void;
  isCancelling?: boolean;
  onMinimize?: () => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
}) {
  const { t } = useTranslation();

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  const timeUnits = [
    t("timeUnits.0"),
    t("timeUnits.1"),
    t("timeUnits.2"),
    t("timeUnits.3"),
  ];

  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatBytes(bytesPerSecond, sizes)}/${timeUnits[0]}`;
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}${timeUnits[0]}`;
    if (seconds < 3600)
      return `${Math.floor(seconds / 60)}${timeUnits[1]} ${
        seconds % 60
      }${timeUnits[0]}`;

    return `${Math.floor(seconds / 3600)}${timeUnits[2]} ${Math.floor(
      (seconds % 3600) / 60,
    )}${timeUnits[1]}`;
  };

  const formatDownloadGroup = (group?: string): string => {
    if (!group) return t("downloadProgress.preparing");

    return t(`downloadProgress.groups.${group}`, {
      defaultValue: group,
    });
  };

  const stageLabel = t(`installationProgress.stages.${info.stage}`);
  const detailsText = info.detailsKey
    ? t(info.detailsKey, {
        defaultValue: info.details || "",
        ...(info.detailsParams || {}),
      })
    : info.details;
  const subProgress = info.subProgress;
  const subProgressTitle = subProgress
    ? t(
        subProgress.titleKey ||
          `installationProgress.subProgress.${subProgress.kind}.title`,
      )
    : "";
  const subProgressDetails = subProgress?.detailsKey
    ? t(subProgress.detailsKey, {
        defaultValue: subProgress.details || "",
        ...(subProgress.detailsParams || {}),
      })
    : subProgress?.details;
  const title =
    info.operation === "integrity"
      ? t("installationProgress.integrityTitle")
      : info.operation === "server"
        ? t("installationProgress.serverTitle")
        : t("installationProgress.title");
  const installProgressValue = info.isIndeterminate
    ? 100
    : Math.max(0, Math.min(100, info.progressPercent));
  const downloadProgressValue =
    downloadInfo?.progressPercent === 0
      ? 100
      : Math.max(0, Math.min(100, downloadInfo?.progressPercent ?? 0));
  const subProgressValue = subProgress?.isIndeterminate
    ? 100
    : Math.max(0, Math.min(100, subProgress?.progressPercent ?? 0));
  const isDone = info.stage === "done";
  const canCancel =
    !!onCancel &&
    !isDone &&
    (info.operation === "install" || info.operation === "integrity");

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100vw-2rem)] overflow-hidden p-0 sm:w-[28rem] sm:max-w-[28rem]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b bg-muted/20 px-5 py-4 text-left">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/20 text-muted-foreground">
              {isDone ? (
                <CheckCircle2 className="size-4" />
              ) : isPaused ? (
                <Pause className="size-4" />
              ) : (
                <PackageCheck className="size-4" />
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <DialogTitle className="max-w-full truncate text-base">
                {title}
              </DialogTitle>
              <DialogDescription
                className="block max-w-full truncate"
                title={info.versionName}
              >
                {info.versionName}
              </DialogDescription>
            </div>
            {isPaused && !isDone ? (
              <Badge variant="secondary" className="mt-0.5 shrink-0 gap-1">
                <Pause className="size-3" />
                {t("installationProgress.paused")}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        <div className="grid gap-3 px-5 pb-4">
          <section className="min-w-0 rounded-lg border bg-muted/15 p-3">
            <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                {info.isIndeterminate ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <PackageCheck className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate text-sm font-medium">
                  {stageLabel}
                </span>
              </div>
              <Badge
                variant="outline"
                className="w-14 shrink-0 justify-center bg-muted/40 tabular-nums"
              >
                {info.progressPercent}%
              </Badge>
            </div>

            <Progress
              value={installProgressValue}
              max={100}
              className={
                info.isIndeterminate
                  ? "[&_[data-slot=progress-indicator]]:animate-pulse"
                  : undefined
              }
            />

            {detailsText ? (
              <p className="mt-2 line-clamp-1 break-words text-xs text-muted-foreground">
                {detailsText}
              </p>
            ) : null}
          </section>

          {subProgress ? (
            <section className="min-w-0 rounded-lg border bg-muted/15 p-3">
              <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <Cpu className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm font-medium">
                    {subProgressTitle}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="w-14 shrink-0 justify-center bg-muted/40 tabular-nums"
                >
                  {subProgress.progressPercent}%
                </Badge>
              </div>

              <Progress
                value={subProgressValue}
                max={100}
                className={
                  subProgress.isIndeterminate
                    ? "[&_[data-slot=progress-indicator]]:animate-pulse"
                    : undefined
                }
              />

              {subProgressDetails ? (
                <p className="mt-2 line-clamp-1 break-words text-xs text-muted-foreground">
                  {subProgressDetails}
                </p>
              ) : null}
            </section>
          ) : null}

          {downloadInfo ? (
            <section className="min-w-0 rounded-lg border bg-muted/15 p-3">
              <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <Download className="size-4 shrink-0 text-muted-foreground" />
                  <span
                    className="min-w-0 truncate text-sm font-medium"
                    title={downloadInfo.currentFileName}
                  >
                    {formatDownloadGroup(downloadInfo.currentGroup)}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="w-14 shrink-0 justify-center bg-muted/40 tabular-nums"
                >
                  {downloadInfo.progressPercent}%
                </Badge>
              </div>

              <Progress
                value={downloadProgressValue}
                max={100}
                className={
                  downloadInfo.progressPercent === 0
                    ? "[&_[data-slot=progress-indicator]]:animate-pulse"
                    : undefined
                }
              />

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="min-w-0 rounded-md border bg-muted/20 px-2.5 py-2">
                  <p className="truncate text-muted-foreground">
                    {t("downloadProgress.files")}
                  </p>
                  <p className="truncate font-medium tabular-nums">
                    {downloadInfo.completedItems}/{downloadInfo.totalItems}
                  </p>
                </div>

                {downloadInfo.totalBytes > 0 ? (
                  <div className="min-w-0 rounded-md border bg-muted/20 px-2.5 py-2">
                    <p className="truncate text-muted-foreground">
                      {t("downloadProgress.size")}
                    </p>
                    <p className="truncate font-medium tabular-nums">
                      {formatBytes(downloadInfo.downloadedBytes, sizes)} /{" "}
                      {formatBytes(downloadInfo.totalBytes, sizes)}
                    </p>
                  </div>
                ) : null}

                {downloadInfo.downloadSpeed &&
                downloadInfo.downloadSpeed > 0 ? (
                  <div className="min-w-0 rounded-md border bg-muted/20 px-2.5 py-2">
                    <p className="truncate text-muted-foreground">
                      {t("skinView.speed")}
                    </p>
                    <p className="truncate font-medium tabular-nums">
                      {formatSpeed(downloadInfo.downloadSpeed)}
                    </p>
                  </div>
                ) : null}

                {downloadInfo.estimatedTimeRemaining &&
                downloadInfo.estimatedTimeRemaining > 0 ? (
                  <div className="min-w-0 rounded-md border bg-muted/20 px-2.5 py-2">
                    <p className="truncate text-muted-foreground">
                      {t("downloadProgress.timeRemaining")}
                    </p>
                    <p className="truncate font-medium tabular-nums">
                      {formatTime(downloadInfo.estimatedTimeRemaining)}
                    </p>
                  </div>
                ) : null}

                {downloadInfo.failedItems > 0 ? (
                  <div className="min-w-0 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-destructive">
                    <p className="truncate">{t("downloadProgress.failed")}</p>
                    <p className="truncate font-medium tabular-nums">
                      {downloadInfo.failedItems}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        {!isDone && (onMinimize || canCancel) ? (
          <DialogFooter className="m-0 flex-row items-center justify-between gap-2 rounded-none border-t bg-muted/25 px-5 py-4">
            {onMinimize ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onMinimize}
              >
                <Minimize2 className="size-4" />
                {t("installationProgress.minimize")}
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {canCancel && onTogglePause ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onTogglePause}
                  disabled={isCancelling}
                >
                  {isPaused ? (
                    <Play className="size-4" />
                  ) : (
                    <Pause className="size-4" />
                  )}
                  {isPaused
                    ? t("installationProgress.resume")
                    : t("installationProgress.pause")}
                </Button>
              ) : null}

              {canCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {t("common.cancel")}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
